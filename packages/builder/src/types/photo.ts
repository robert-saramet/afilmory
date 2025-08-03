import type { Tags } from 'exiftool-vendored'

// Tone type definition
export type ToneType = 'low-key' | 'high-key' | 'normal' | 'high-contrast'

// Compressed histogram data structure
export interface CompressedHistogramData {
  red: number[] // 64 points, downsampled data
  green: number[] // 64 points, downsampled data
  blue: number[] // 64 points, downsampled data
  luminance: number[] // 64 points, downsampled data
}

// Raw histogram data structure (for internal calculation only)
export interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

// Tone analysis result
export interface ToneAnalysis {
  toneType: ToneType
  brightness: number // 0-100, average brightness
  contrast: number // 0-100, contrast
  shadowRatio: number // 0-1, shadow area ratio
  highlightRatio: number // 0-1, highlight area ratio
}

export interface PhotoInfo {
  title: string
  dateTaken: string
  tags: string[] // Display tags (path tags, etc.)
  equipmentTags: string[] // Equipment tags (camera, lens, for filtering only)
  description: string
}

export interface ImageMetadata {
  width: number
  height: number
  format: string
}

export interface PhotoManifestItem extends PhotoInfo {
  id: string
  originalUrl: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: PickedExif | null
  toneAnalysis: ToneAnalysis | null // Tone analysis result
  isLivePhoto?: boolean
  isHDR?: boolean
  livePhotoVideoUrl?: string
  livePhotoVideoS3Key?: string
}

export interface ProcessPhotoResult {
  item: PhotoManifestItem | null
  type: 'processed' | 'skipped' | 'new' | 'failed'
}

export interface PickedExif {
  // Timezone and time related
  zone?: string
  tz?: string
  tzSource?: string

  // Basic camera information
  Orientation?: number
  Make?: string
  Model?: string
  Software?: string
  Artist?: string
  Copyright?: string

  // Exposure related
  ExposureTime?: string | number
  FNumber?: number
  ExposureProgram?: string
  ISO?: number
  ShutterSpeedValue?: string | number
  ApertureValue?: number
  BrightnessValue?: number
  ExposureCompensation?: number
  MaxApertureValue?: number

  // Time offset
  OffsetTime?: string
  OffsetTimeOriginal?: string
  OffsetTimeDigitized?: string

  // Light source and flash
  LightSource?: string
  Flash?: string

  // Focal length related
  FocalLength?: string
  FocalLengthIn35mmFormat?: string

  // Lens related

  LensMake?: string
  LensModel?: string

  // Color and capture mode
  ColorSpace?: string

  ExposureMode?: string
  SceneCaptureType?: string

  // Calculated fields
  Aperture?: number
  ScaleFactor35efl?: number
  ShutterSpeed?: string | number
  LightValue?: number

  // Date and time (processed ISO format)
  DateTimeOriginal?: string
  DateTimeDigitized?: string

  // Image dimensions
  ImageWidth?: number
  ImageHeight?: number

  MeteringMode: Tags['MeteringMode']
  WhiteBalance: Tags['WhiteBalance']
  WBShiftAB: Tags['WBShiftAB']
  WBShiftGM: Tags['WBShiftGM']
  WhiteBalanceBias: Tags['WhiteBalanceBias']
  WhiteBalanceFineTune: Tags['WhiteBalanceFineTune']
  FlashMeteringMode: Tags['FlashMeteringMode']
  SensingMethod: Tags['SensingMethod']
  FocalPlaneXResolution: Tags['FocalPlaneXResolution']
  FocalPlaneYResolution: Tags['FocalPlaneYResolution']
  GPSAltitude: Tags['GPSAltitude']
  GPSLatitude: Tags['GPSLatitude']
  GPSLongitude: Tags['GPSLongitude']
  GPSAltitudeRef: Tags['GPSAltitudeRef']
  GPSLatitudeRef: Tags['GPSLatitudeRef']
  GPSLongitudeRef: Tags['GPSLongitudeRef']

  // Fuji film recipe
  FujiRecipe?: FujiRecipe

  // HDR related
  MPImageType?: Tags['MPImageType']

  // Rating
  Rating?: number
}

export interface ThumbnailResult {
  thumbnailUrl: string | null
  thumbnailBuffer: Buffer | null
  thumbHash: Uint8Array | null
}

export type FujiRecipe = {
  FilmMode:
    | 'F0/Standard (Provia)'
    | 'F1/Studio Portrait'
    | 'F1a/Studio Portrait Enhanced Saturation'
    | 'F1b/Studio Portrait Smooth Skin Tone (Astia)'
    | 'F1c/Studio Portrait Increased Sharpness'
    | 'F2/Fujichrome (Velvia)'
    | 'F3/Studio Portrait Ex'
    | 'F4/Velvia'
    | 'Pro Neg. Std'
    | 'Pro Neg. Hi'
    | 'Classic Chrome'
    | 'Eterna'
    | 'Classic Negative'
    | 'Bleach Bypass'
    | 'Nostalgic Neg'
    | 'Reala ACE'
  GrainEffectRoughness: 'Off' | 'Weak' | 'Strong'
  GrainEffectSize: 'Off' | 'Small' | 'Large'
  ColorChromeEffect: 'Off' | 'Weak' | 'Strong'
  ColorChromeFxBlue: 'Off' | 'Weak' | 'Strong'
  WhiteBalance:
    | 'Auto'
    | 'Auto (white priority)'
    | 'Auto (ambiance priority)'
    | 'Daylight'
    | 'Cloudy'
    | 'Daylight Fluorescent'
    | 'Day White Fluorescent'
    | 'White Fluorescent'
    | 'Warm White Fluorescent'
    | 'Living Room Warm White Fluorescent'
    | 'Incandescent'
    | 'Flash'
    | 'Underwater'
    | 'Custom'
    | 'Custom2'
    | 'Custom3'
    | 'Custom4'
    | 'Custom5'
    | 'Kelvin'
  /**
   * White balance fine tune adjustment (e.g., "Red +0, Blue +0")
   */
  WhiteBalanceFineTune: string
  DynamicRange: 'Standard' | 'Wide'
  /**
   * Highlight tone adjustment (e.g., "+2 (hard)", "0 (normal)", "-1 (medium soft)")
   */
  HighlightTone: string
  /**
   * Shadow tone adjustment (e.g., "-2 (soft)", "0 (normal)")
   */
  ShadowTone: string
  /**
   * Saturation adjustment (e.g., "+4 (highest)", "0 (normal)", "-2 (low)")
   */
  Saturation: string
  /**
   * Sharpness setting (e.g., "Normal", "Hard", "Soft")
   */
  Sharpness: string
  /**
   * Noise reduction setting (e.g., "0 (normal)", "-1 (medium weak)")
   */
  NoiseReduction: string
  /**
   * Clarity adjustment (typically 0)
   */
  Clarity: number
  /**
   * Color temperature setting (e.g., "5000", "6500")
   */
  ColorTemperature: Tags['ColorTemperature']
  /**
   * Development dynamic range setting (e.g., "100", "200")
   */
  DevelopmentDynamicRange: number
  /**
   * Dynamic range setting (e.g., Auto, Manual, Standard, Wide1, Wide2, Film Simulation)
   */
  DynamicRangeSetting: Tags['DynamicRangeSetting']
}

export type SonyRecipe = {
  /**
   * Adobe RGB
   * Real
   * Standard
   * Vivid
   * Portrait
   * Landscape
   * Sunset
   * Nightview
   * BW
   * Neutral
   * Clear
   * Deep
   * Light
   * Autumn Leaves
   * Sepia
   * VV2
   * FL
   * IN
   * SH
   */
  CreativeStyle: string

  /**
   *  Off
   *  Toy Camera
   *  Pop Color
   *  Posterization
   *  Posterization B/W
   *  Retro Photo
   *  Soft High Key
   *  Partial Color (red)
   *  Partial Color (green)
   *  Partial Color (blue)
   *  Partial Color (yellow)
   *  High Contrast Monochrome
   *  Toy Camera (normal)
   *  Toy Camera (cool)
   *  Toy Camera (warm)
   *  Toy Camera (green)
   *  Toy Camera (magenta)
   *  Soft Focus (low)
   *  Soft Focus
   *  Soft Focus (high)
   *  Miniature (auto)
   *  Miniature (top)
   *  Miniature (middle horizontal)
   *  Miniature (bottom)
   *  Miniature (left)
   *  Miniature (middle vertical)
   *  Miniature (right)
   *  HDR Painting (low)
   *  HDR Painting
   *  HDR Painting (high)
   *  Rich-tone Monochrome
   *  Water Color
   *  Water Color 2
   *  Illustration (low)
   *  Illustration
   *  Illustration (high)
   */
  PictureEffect: string

  /**
   * 0 => 'Off',
   * 1 => 'On',
   */
  Hdr: string

  /**
   * Off, Low, Mid, High
   */
  SoftSkinEffect: string
}
