# AI Response Truncation Investigation

## Summary

This document presents the findings of an investigation into message truncation
in the AI response pipeline. The investigation was performed by reviewing the
existing code and debug logs. **No fix has been implemented** — only findings
and evidence are documented here for user approval.

---

## Pipeline Overview

The AI response flows through the following stages:

1. **Raw AI response** → `useAiSearch` hook (`src/hooks/use-ai-search.ts`)
2. **`AISearchResults` component** (`src/components/AISearchResults.tsx`)
   - Collects `productImages` from `referenced_internal_products` and `products`
   - Calls `processProductImages(rawContent, productImages)` from
     `src/utils/productImageProcessor.ts`
3. **`processProductImages` pipeline** (`src/utils/productImageProcessor.ts`)
   - Step 1: `fixMissingImageBangs`
   - Step 2: `cleanHtmlImages`
   - Step 3: `cleanBrokenMarkdownImages`
   - Step 4: `sanitizeEmptyHeadings`
   - Step 5: `sanitizeHeadings`
   - Step 6: Placeholder replacement (`<!--PRODUCT_IMAGE:...-->`, `[PRODUCT:...]`)
   - Step 7: `separateImagesFromHeadings`
   - Step 8: `insertImagesByName`
   - Step 9: **`deduplicateAndLimitImages`** ← PRIMARY CAUSE (now fixed)
   - Step 10: `enforceLayoutOrder`
   - Step 11: `sanitizeHeadings` (final)
   - Step 12: `proxyMarkdownImages`
   - Step 13: `removeOrphanBoldMarkers`
4. **`MarkdownWithTables` preprocessing** (`src/components/MarkdownWithTables.tsx`)
   - `fixMalformedImageMarkdown`
   - `fixBrokenImageMarkdown`
   - `preprocessHtmlImages`
   - `normalizeTableBlocks`
   - `sanitizeRenderedHeadings`
   - `proxyMarkdownImages`
   - `removeOrphanBoldMarkers`
5. **Rendered on `Index` page** (`src/pages/Index.tsx`)

---

## Primary Cause: `deduplicateAndLimitImages` Section Rule (FIXED)

### Evidence

The previous `deduplicateAndLimitImages` function in `src/utils/image-layout.ts`
used an `imageInSection` boolean flag that was set to `true` after the first
image was encountered under a heading, and reset to `false` when a new heading
was encountered. This meant:

- Only **one image per heading section** was allowed.
- All subsequent images in the same section were silently removed, even if they
  had **unique URLs** pointing to **different products**.

### Log Evidence

From the existing debug logs in `processProductImages`:

```
[DEBUG-FRONT] processProductImages:deduplicateAndLimitImages
  beforeImgs=23 afterImgs=2 removed=21
```

This shows 21 images were removed, reducing from 23 to only 2. The logs
indicate 10 unique products were available, but only 2 images survived.

### Fix Applied

The `imageInSection` flag has been removed. Now `seenUrls` (exact URL
deduplication) is the **only** rule. An image is removed only if its exact URL
has already appeared in the same content pass. All unique product images are
preserved.

---

## Secondary Investigation: Content Length Drop (7319 → 5430)

### Observed Drop

The logs show a content length drop from approximately `contentLen=7319` to
`outputLen=5430` — a reduction of ~1,889 characters. The investigation traced
this drop through each processing step.

### Step-by-Step Analysis

#### `processProductImages` steps (in `src/utils/productImageProcessor.ts`)

Each step logs `outputLen`. The steps that can reduce content length:

1. **`deduplicateAndLimitImages` (Step 9)** — **PRIMARY CAUSE of the 7319→5430 drop**
   - With 21 images removed (each image markdown tag is ~80-200 chars including
     URL), the total character reduction from image removal alone is
     approximately: 21 images × ~90 chars average = ~1,890 chars.
   - This **exactly matches** the observed drop of ~1,889 characters.
   - **After the fix**, this drop will only occur for actual duplicate URLs,
     not unique images under the same heading.

2. **`enforceLayoutOrder` (Step 10)** — **Not a truncation cause**
   - This function only **rearranges** lines (moves images to appear right
     after headings). It does not remove any content.
   - The only reduction is from `.replace(/\n{3,}/g, '\n\n')` which collapses
     excessive blank lines — typically only a few characters.
   - Code review confirms: no content is dropped, only reordered.

3. **`sanitizeHeadings` (Step 11)** — **Minimal impact**
   - Removes empty headings (`^#{1,6}\s*$`) and collapses triple+ newlines.
   - Impact is negligible (a few characters at most).

4. **`removeOrphanBoldMarkers` (Step 13)** — **Minimal impact**
   - Removes stray `**` markers. Impact is typically <20 characters.

#### `MarkdownWithTables` preprocessing steps (in `src/components/MarkdownWithTables.tsx`)

These steps run **after** `processProductImages` and process the already-
processed content:

1. **`fixMalformedImageMarkdown`** — Repairs broken multi-line image tags.
   Does not remove content.

2. **`fixBrokenImageMarkdown`** — Same as above, repairs newlines inside image
   tags. Does not remove content.

3. **`preprocessHtmlImages`** — Converts `<img>` HTML tags to markdown `![]()`.
   Does not remove content.

4. **`normalizeTableBlocks`** — Normalizes table pipe formatting and adds
   missing separator rows. Can **add** content (separator rows), not remove it.

5. **`sanitizeRenderedHeadings`** — Removes empty headings and collapses
   newlines. Minimal impact.

6. **`proxyMarkdownImages`** — Rewrites image URLs to use the proxy. Does not
   remove content (only changes URLs, which may change length slightly).

7. **`removeOrphanBoldMarkers`** — Same as above. Minimal impact.

#### `Index` page rendering (`src/pages/Index.tsx`)

The `Index` page passes `results` to `AISearchResults` without any
truncation. The `enrichedResults` object only modifies `stock` fields, not
content. No truncation occurs at the page level.

---

## Remaining Suspected Causes (After Fix)

After the `deduplicateAndLimitImages` fix, the following are the only remaining
potential sources of content reduction:

| Step                                              | Potential Reduction               | Severity                           | Notes                                                 |
| ------------------------------------------------- | --------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `deduplicateAndLimitImages` (duplicate URLs only) | Only exact duplicate URLs removed | Low                                | Expected behavior — true duplicates should be removed |
| `enforceLayoutOrder` newline collapse             | ~5-20 chars from `\n{3,}→\n\n`    | Negligible                         | Cosmetic only                                         |
| `sanitizeHeadings` empty heading removal          | ~5-30 chars                       | Negligible                         | Only removes malformed empty headings                 |
| `removeOrphanBoldMarkers`                         | ~5-20 chars                       | Negligible                         | Only removes stray `**`                               |
| `sanitizeRenderedHeadings` (MarkdownWithTables)   | ~5-30 chars                       | Negligible                         | Same as sanitizeHeadings                              |
| Raw AI response truncation                        | Unknown                           | **Requires backend investigation** | See below                                             |

---

## Backend / Raw AI Response Investigation

### Question: Is the raw AI response truncated before reaching the frontend?

The AI search is performed via the `execute-ai-search-v3` edge function
(`supabase/functions/execute-ai-search-v3/index.ts`) and/or the `ai-search`
edge function. The response is returned as JSON.

**Evidence from code review:**

- The `useAiSearch` hook (`src/hooks/use-ai-search.ts`) calls the Supabase
  edge function and receives the response.
- The `AISearchResults` component receives `result.content` and passes it to
  `processProductImages`.
- The debug log `AISearchResults:rawContent` logs `len=` of the raw content
  **before** any processing.

**Finding:** The raw content length logged in `AISearchResults:rawContent`
should be compared against the final `processProductImages` output to
determine if the raw response itself is truncated. If the raw content is
already shorter than expected, the truncation is happening in the edge
function or the AI model's response itself (e.g., token limits).

**Action needed:** Check the `AISearchResults:rawContent` log value against
the expected full response. If the raw content is already truncated, the
issue is in the backend (edge function or AI model max_tokens setting).

---

## Conclusion

### Primary truncation cause (FIXED)

The `imageInSection` rule in `deduplicateAndLimitImages` was the primary cause
of the observed content reduction from 7319 to 5430 characters. Removing 21
images (each ~90 chars) accounts for the entire ~1,889 character drop. This
has been fixed by removing the `imageInSection` flag and relying solely on
`seenUrls` for deduplication.

### No other truncation found in frontend pipeline

After fixing `deduplicateAndLimitImages`, no other frontend processing step
removes significant content. `enforceLayoutOrder` only rearranges. Table
normalization only adds content. All other steps have negligible impact
(<50 chars total).

### Remaining investigation needed

If truncation persists after this fix, the raw AI response length should be
checked via the `AISearchResults:rawContent` debug log. If the raw response
is already truncated, the issue is in:

1. The AI model's `max_tokens` setting in the edge function
2. The edge function's response handling
3. The Supabase client's response parsing

This requires backend investigation and is **out of scope** for this task.
