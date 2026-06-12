# Bug #007: OCR /extract endpoint allows path traversal — reads any file the server can access

**Found:** 2026-04-28
**Severity:** Critical
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
`POST /api/v1/ocr/extract` accepts `{"filePath": "<any string>"}` from the client and passes it to `path.isAbsolute(...)` then `fs.open()` (via Tesseract.js). On Windows, paths starting with `/` (e.g. `/../../package.json`) are treated as drive-relative and resolve to e.g. `C:\package.json`. A malicious authenticated user can probe for arbitrary files on the server's filesystem and, where Tesseract can read them, leak content via the rawText response.

The error message also leaks server internals: `"ENOENT: no such file or directory, open 'C:\\package.json'"` discloses the absolute server path even when the file isn't found.

## Steps to Reproduce
1. Login as any authenticated user.
2. Probe an arbitrary path:
   ```
   curl -b admin.cookie -X POST http://localhost:5000/api/v1/ocr/extract \
     -H "Content-Type: application/json" \
     -d '{"filePath":"/../../package.json"}'
   ```
3. Response (HTTP 500):
   ```
   {"success":false,"message":"ENOENT: no such file or directory, open 'C:\\package.json'"}
   ```
4. The path resolution moved the file lookup outside `server/src/uploads`. With the right traversal you can target any image/pdf in the upload dir's parent tree.
5. Even when the file IS readable (say a JPG that was uploaded by another tenant or a config that happens to be readable), the OCR rawText is returned to the caller — an information-disclosure vector.

## Expected
- The endpoint should accept only an opaque filename / id of a file uploaded in the same session by the same user.
- Resolve the path strictly under `server/src/uploads` — `path.basename()` then `path.join(uploadsDir, basename)`.
- Reject any path containing `..`, drive letters, or starting with `/` or `\`.

## Actual
- `ocr.controller.extractData` line 35: `const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);` — happily honors any caller-supplied absolute path.
- No filename normalization, no allow-list, no per-user ownership check.

## Evidence
- Live curl above. Reproduced twice with two different traversal targets.
- Source: `server/src/controllers/ocr.controller.js` lines 27–50.

## Root Cause Hypothesis
The author intended the endpoint to consume the relative `fileUrl` returned by `/ocr/upload` and forgot to defensively normalize. They also bypassed multer's storage location knowledge.

## Suggested Fix
1. Change `extractData` to accept only `{ filename: <basename> }` and resolve as `path.join(uploadsDir, path.basename(filename))`.
2. Reject any filename containing path separators or `..`.
3. (Optional, stronger) Track upload IDs in a server-side store keyed by user; require the upload ID, not a filename.
4. Sanitize error messages — never echo absolute paths back in the response body.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- `POST /ocr/extract {filePath:"/../../package.json"}` → 400 `{"message":"Invalid file."}`.
- `POST /ocr/extract {filename:"../../package.json"}` → 400 same clean message.
- `POST /ocr/extract {filename:"/etc/passwd"}` → 400 same clean message.
- No absolute paths echoed back in any response.
