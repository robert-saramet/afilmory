# Translation and Internationalization Report

This document tracks the progress and issues found during the codebase translation and internationalization effort.

## Summary of Work

The goal is to translate all non-English text in the codebase to English and move hardcoded strings to the i18n framework.

### Progress:
- Translated comments in `apps/web/index.html`.
- Translated comments in Vite plugins (`apps/web/plugins/vite/`).
- Internationalized hardcoded strings in `apps/web/src/components/ui/map/ClusterPhotoGrid.tsx` and `apps/web/src/components/ui/map/shared/MapControls.tsx`.
- Translated comments and internationalized strings in `apps/web/src/components/ui/slider.tsx`.
- Translated comments in the majority of files in `apps/web/src/components/`.
- Internationalized hardcoded strings in `apps/web/src/pages/explory/index.tsx`.
- Translated comments in `apps/web/src/lib/`.

## Identified Issues

### 1. Locale-Dependent Logic

**Files:**
- `apps/web/src/components/ui/date-range-indicator/DateRangeIndicator.tsx`
- `apps/web/src/hooks/useVisiblePhotosDateRange.ts`

**Description:**
The logic in these files is tightly coupled with Chinese characters.

- In `DateRangeIndicator.tsx`, the `parseMainDate` function uses regular expressions that match Chinese characters for "year" (年), "month" (月), and "day" (日) to parse date strings. This will fail for date strings in other languages.

- In `useVisiblePhotosDateRange.ts`, the code attempts to extract location information from photo tags by checking for Chinese keywords like "省" (province), "市" (city), etc.

**Resolution:**
As per user instruction, I have added `TODO` comments in the code to flag these issues and proceeded with translating only the comments for now. A more robust, locale-aware solution should be implemented in the future.

### 2. Tooling Issues

**Tool:** `replace_with_git_merge_diff`

**Description:**
I have been encountering a recurring "search block not found" error when using the `replace_with_git_merge_diff` tool. This seems to happen when the tool's internal state of a file becomes out of sync with the actual file content after a series of modifications.

**Workaround:**
I have been re-reading the file using `read_files` before each use of `replace_with_git_merge_diff` to ensure the tool has the latest version of the file. This has been effective but has slowed down my progress.

## Next Steps
- Continue translating comments in `apps/web/src/pages/(data)/manifest.tsx`.
- Complete translation of all remaining files in `apps/web/src/pages/`.
- Proceed with the rest of the plan, including translating documentation and running tests.
- Submit the changes for review.
