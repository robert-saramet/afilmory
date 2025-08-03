/* eslint-disable unicorn/prefer-event-target */
import type { Worker } from 'node:cluster'
import cluster from 'node:cluster'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { serialize } from 'node:v8'

import type { Logger } from '../logger/index.js'
import { logger } from '../logger/index.js'

export interface ClusterPoolOptions {
  concurrency: number
  totalTasks: number
  workerEnv?: Record<string, string> // Environment variables to pass to the worker
  workerConcurrency?: number // Concurrency within each worker
  // New: shared data to pass to the worker
  sharedData?: {
    existingManifestMap: Map<string, any>
    livePhotoMap: Map<string, any>
    imageObjects: any[]
  }
}

export interface WorkerReadyMessage {
  type: 'ready' | 'pong'
  workerId: number
}

export interface TaskMessage {
  type: 'task'
  taskId: string
  taskIndex: number
  workerId: number
}

export interface BatchTaskMessage {
  type: 'batch-task'
  tasks: Array<{
    taskId: string
    taskIndex: number
  }>
  workerId: number
}

export interface TaskResult {
  type: 'result' | 'error'
  taskId: string
  result?: any
  error?: string
}

export interface BatchTaskResult {
  type: 'batch-result'
  results: TaskResult[]
}

export interface WorkerStats {
  workerId: number
  processedTasks: number
  isIdle: boolean
  isReady: boolean
}

export interface WorkerInitMessage {
  type: 'init'
  sharedData: {
    data: number[] // Convert Buffer to array for transmission
    length: number
  }
}

// Worker pool manager based on Node.js cluster
export class ClusterPool<T> extends EventEmitter {
  private concurrency: number
  private totalTasks: number
  private workerEnv: Record<string, string>
  private workerConcurrency: number
  private logger: Logger
  private sharedData?: ClusterPoolOptions['sharedData']

  private taskQueue: Array<{ taskIndex: number }> = []
  private workers = new Map<number, Worker>()
  private workerStats = new Map<number, WorkerStats>()
  private pendingTasks = new Map<
    string,
    { resolve: (value: T) => void; reject: (error: Error) => void }
  >()
  private results: T[] = []
  private completedTasks = 0
  private isShuttingDown = false
  private readyWorkers = new Set<number>()
  private workerTaskCounts = new Map<number, number>() // Track the number of tasks currently being processed by each worker
  private initializedWorkers = new Set<number>() // Track initialized workers

  constructor(options: ClusterPoolOptions) {
    super()
    this.concurrency = options.concurrency
    this.totalTasks = options.totalTasks
    this.workerEnv = options.workerEnv || {}
    this.workerConcurrency = options.workerConcurrency || 5 // By default, each worker processes 5 tasks simultaneously
    this.logger = logger
    this.sharedData = options.sharedData

    this.results = Array.from({ length: this.totalTasks })
  }

  async execute(): Promise<T[]> {
    this.logger.main.info(
      `Starting cluster mode task processing, number of processes: ${this.concurrency}, total tasks: ${this.totalTasks}`,
    )

    // Prepare the task queue - only contains taskIndex
    for (let i = 0; i < this.totalTasks; i++) {
      this.taskQueue.push({
        taskIndex: i,
      })
    }

    // Start worker process
    await this.startWorkers()

    // Wait for all workers to be ready
    await this.waitForWorkersReady()

    // Wait for all tasks to complete
    return new Promise((resolve, reject) => {
      this.on('allTasksCompleted', () => {
        this.logger.main.success(
          `All tasks completed, starting to shut down the process pool`,
        )
        this.shutdown()
          .then(() => {
            resolve(this.results)
          })
          .catch(reject)
      })

      this.on('error', reject)

      // Start distributing tasks
      this.distributeInitialTasks()
    })
  }

  private async startWorkers(): Promise<void> {
    // Set cluster environment variables to enable worker mode
    cluster.setupPrimary({
      exec: process.argv[1], // Use the current script (CLI) as the worker
      args: ['--cluster-worker'], // Pass worker identification parameters
      silent: false,
    })

    // Determine how many workers to start based on the number of tasks and the concurrency capability of each worker
    // Number of workers needed = Math.ceil(total tasks / concurrency per worker)
    // But cannot exceed the concurrency limit
    const requiredWorkers = Math.ceil(this.totalTasks / this.workerConcurrency)
    const workersToStart = Math.min(this.concurrency, requiredWorkers)

    this.logger.main.info(
      `Calculating number of workers: total tasks ${this.totalTasks}, concurrency per worker ${this.workerConcurrency}, required ${requiredWorkers}, starting ${workersToStart}`,
    )

    for (let i = 1; i <= workersToStart; i++) {
      await this.createWorker(i)
    }
  }

  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = cluster.fork({
        WORKER_ID: workerId.toString(),
        CLUSTER_WORKER: 'true',
        WORKER_CONCURRENCY: this.workerConcurrency.toString(),
        ...this.workerEnv, // Pass custom environment variables
      })

      this.workers.set(workerId, worker)
      this.workerStats.set(workerId, {
        workerId,
        processedTasks: 0,
        isIdle: true,
        isReady: false,
      })
      this.workerTaskCounts.set(workerId, 0) // Initialize task count

      const workerLogger = this.logger.worker(workerId)

      worker.on('online', () => {
        workerLogger.start(
          `Worker ${workerId} process started (PID: ${worker.process?.pid})`,
        )
        resolve()
      })

      worker.on(
        'message',
        (
          message:
            | TaskResult
            | BatchTaskResult
            | WorkerReadyMessage
            | { type: 'init-complete'; workerId: number },
        ) => {
          switch (message.type) {
          case 'ready': 
          case 'pong': {
            this.handleWorkerReady(workerId, message as WorkerReadyMessage)
          
          break;
          }
          case 'init-complete': {
            this.handleWorkerInitComplete(workerId)
          
          break;
          }
          case 'batch-result': {
            this.handleWorkerBatchResult(workerId, message as BatchTaskResult)
          
          break;
          }
          default: {
            this.handleWorkerMessage(workerId, message as TaskResult)
          }
          }
        },
      )

      worker.on('error', (error) => {
        workerLogger.error(`Worker ${workerId} process error:`, error)
        this.handleWorkerError(workerId, error)
      })

      worker.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          workerLogger.error(
            `Worker ${workerId} exited unexpectedly (code: ${code}, signal: ${signal})`,
          )
          // Restart worker
          setTimeout(() => this.createWorker(workerId), 1000)
        } else {
          workerLogger.info(`Worker ${workerId} exited normally`)
        }
      })

      // Set timeout
      setTimeout(() => {
        if (!worker.isDead()) {
          reject(new Error(`Worker ${workerId} startup timed out`))
        }
      }, 10000)
    })
  }

  private handleWorkerReady(
    workerId: number,
    _message: WorkerReadyMessage,
  ): void {
    const stats = this.workerStats.get(workerId)
    const worker = this.workers.get(workerId)
    const workerLogger = this.logger.worker(workerId)

    if (stats && worker && !this.initializedWorkers.has(workerId)) {
      // Send initialization data when ready for the first time, but do not mark as ready immediately
      if (this.sharedData) {
        // Use v8.serialize to serialize data to maintain type integrity
        const serializedBuffer = serialize({
          existingManifestMap: this.sharedData.existingManifestMap,
          livePhotoMap: this.sharedData.livePhotoMap,
          imageObjects: this.sharedData.imageObjects,
        })

        // Convert Buffer to array for transmission via IPC
        const initMessage: WorkerInitMessage = {
          type: 'init',
          sharedData: {
            data: Array.from(serializedBuffer),
            length: serializedBuffer.length,
          },
        }
        worker.send(initMessage)
        workerLogger.info(`Sending initialization data to Worker ${workerId}`)
      }

      this.initializedWorkers.add(workerId)
      workerLogger.info(
        `Worker ${workerId} has received initialization request, waiting for initialization to complete`,
      )
    } else if (stats) {
      // Subsequent ready messages (e.g., pong response)
      stats.isReady = true
      this.readyWorkers.add(workerId)
      workerLogger.info(`Worker ${workerId} is ready`)
      this.emit('workerReady', workerId)
    }
  }

  private handleWorkerInitComplete(workerId: number): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)

    if (stats) {
      stats.isReady = true
      this.readyWorkers.add(workerId)
      workerLogger.info(
        `Worker ${workerId} has completed initialization and can accept tasks`,
      )
      this.emit('workerReady', workerId)

      // Immediately assign a task to this worker
      this.assignBatchTasksToWorker(workerId)
    }
  }

  private distributeInitialTasks(): void {
    // Assign initial task batches to each worker
    for (const [workerId] of this.workers) {
      this.assignBatchTasksToWorker(workerId)
    }
  }

  private assignBatchTasksToWorker(workerId: number): void {
    if (this.taskQueue.length === 0) return

    const worker = this.workers.get(workerId)
    const stats = this.workerStats.get(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    // Ensure the worker has been initialized (included in initializedWorkers and isReady is true)
    if (
      !worker ||
      !stats ||
      !stats.isReady ||
      !this.initializedWorkers.has(workerId)
    )
      return

    // If the current worker's task count has reached the concurrency limit, do not assign new tasks
    if (currentTaskCount >= this.workerConcurrency) return

    // Calculate the number of tasks that can be assigned
    const availableSlots = this.workerConcurrency - currentTaskCount
    const tasksToAssign = Math.min(availableSlots, this.taskQueue.length)

    if (tasksToAssign === 0) return

    // Assign a batch of tasks
    const tasks: Array<{ taskId: string; taskIndex: number }> = []
    for (let i = 0; i < tasksToAssign; i++) {
      const task = this.taskQueue.shift()
      if (!task) break

      const taskId = `${workerId}-${task.taskIndex}-${Date.now()}-${i}`
      tasks.push({
        taskId,
        taskIndex: task.taskIndex,
      })

      // Set the Promise for pending tasks
      this.pendingTasks.set(taskId, {
        resolve: (_value: T) => {
          // Promise resolve callback
        },
        reject: (_error: Error) => {
          // Promise reject callback
        },
      })
    }

    // Update worker status
    this.workerTaskCounts.set(workerId, currentTaskCount + tasks.length)
    stats.isIdle = tasks.length === 0

    // Send batch tasks
    const message: BatchTaskMessage = {
      type: 'batch-task',
      tasks,
      workerId,
    }

    worker.send(message)

    const workerLogger = this.logger.worker(workerId)
    workerLogger.info(
      `Assigned ${tasks.length} tasks (currently processing: ${currentTaskCount + tasks.length}/${this.workerConcurrency})`,
    )
  }

  private handleWorkerBatchResult(
    workerId: number,
    message: BatchTaskResult,
  ): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    if (!stats) return

    let completedInBatch = 0
    let successfulInBatch = 0

    // Process each task in the batch result
    for (const taskResult of message.results) {
      const pendingTask = this.pendingTasks.get(taskResult.taskId)
      if (!pendingTask) {
        workerLogger.warn(`Received unknown task result: ${taskResult.taskId}`)
        continue
      }

      this.pendingTasks.delete(taskResult.taskId)
      completedInBatch++

      if (taskResult.type === 'result' && taskResult.result !== undefined) {
        // Extract taskIndex from taskId
        const taskIndex = Number.parseInt(taskResult.taskId.split('-')[1])
        this.results[taskIndex] = taskResult.result
        successfulInBatch++

        this.completedTasks++
      } else if (taskResult.type === 'error') {
        workerLogger.error(
          `Task execution failed: ${taskResult.taskId}`,
          taskResult.error,
        )
        pendingTask.reject(new Error(taskResult.error))
      }
    }

    // Update worker status
    const newTaskCount = Math.max(0, currentTaskCount - completedInBatch)
    this.workerTaskCounts.set(workerId, newTaskCount)
    stats.processedTasks += successfulInBatch
    stats.isIdle = newTaskCount === 0

    workerLogger.info(
      `Completed batch of tasks: ${successfulInBatch}/${completedInBatch} successful (total completed: ${this.completedTasks}/${this.totalTasks}, currently processing: ${newTaskCount})`,
    )

    // Check if all tasks are complete
    if (this.completedTasks >= this.totalTasks) {
      this.emit('allTasksCompleted')
      return
    }

    // Assign the next batch of tasks to this worker
    this.assignBatchTasksToWorker(workerId)
  }

  private handleWorkerMessage(workerId: number, message: TaskResult): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    if (!stats) return

    const pendingTask = this.pendingTasks.get(message.taskId)
    if (!pendingTask) {
      workerLogger.warn(`Received unknown task result: ${message.taskId}`)
      return
    }

    this.pendingTasks.delete(message.taskId)

    // Update task count
    const newTaskCount = Math.max(0, currentTaskCount - 1)
    this.workerTaskCounts.set(workerId, newTaskCount)
    stats.isIdle = newTaskCount === 0

    if (message.type === 'result' && message.result !== undefined) {
      // Extract taskIndex from taskId
      const taskIndex = Number.parseInt(message.taskId.split('-')[1])
      this.results[taskIndex] = message.result
      stats.processedTasks++

      this.completedTasks++
      workerLogger.info(
        `Completed task ${taskIndex + 1}/${this.totalTasks} (completed: ${this.completedTasks}, currently processing: ${newTaskCount})`,
      )

      // Check if all tasks are complete
      if (this.completedTasks >= this.totalTasks) {
        this.emit('allTasksCompleted')
        return
      }
    } else if (message.type === 'error') {
      workerLogger.error(`Task execution failed: ${message.taskId}`, message.error)
      pendingTask.reject(new Error(message.error))
    }

    // Assign the next batch of tasks to this worker
    this.assignBatchTasksToWorker(workerId)
  }

  private handleWorkerError(workerId: number, error: Error): void {
    const stats = this.workerStats.get(workerId)
    if (stats) {
      stats.isIdle = true
    }

    this.emit('error', error)
  }

  private async shutdown(): Promise<void> {
    this.isShuttingDown = true
    const shutdownPromises: Promise<void>[] = []

    for (const [, worker] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          const timeout = setTimeout(() => {
            worker.kill('SIGKILL')
            resolve()
          }, 0)

          worker.on('exit', () => {
            clearTimeout(timeout)
            resolve()
          })

          // Send shutdown signal
          worker.send({ type: 'shutdown' })
        }),
      )
    }

    await Promise.all(shutdownPromises)
    this.workers.clear()
    this.workerStats.clear()
  }

  private async waitForWorkersReady(): Promise<void> {
    return new Promise((resolve) => {
      const requiredWorkers = Math.ceil(
        this.totalTasks / this.workerConcurrency,
      )
      const expectedWorkers = Math.min(this.concurrency, requiredWorkers)

      const checkReady = () => {
        if (this.readyWorkers.size >= expectedWorkers) {
          this.logger.main.info(
            `All ${expectedWorkers} worker processes are ready`,
          )
          resolve()
        }
      }

      this.on('workerReady', checkReady)
      checkReady() // Check immediately
    })
  }

  // Get worker statistics
  getWorkerStats(): WorkerStats[] {
    return Array.from(this.workerStats.values())
  }
}
