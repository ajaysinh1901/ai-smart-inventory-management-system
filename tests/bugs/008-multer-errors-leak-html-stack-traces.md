# Bug #008: Multer file-type/size errors leak full Node stack traces as HTML 500

**Found:** 2026-04-28
**Severity:** Medium
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
When a user uploads a non-allowed file type (e.g. `.txt`) or a file over 10MB to `POST /api/v1/ocr/upload`, the response is **HTML** (Express's default error handler) with the **full Node stack trace** including absolute filesystem paths under `node_modules` and the application source. Users expect a clean JSON 400; security expects no stack traces.

## Steps to Reproduce

### Wrong file type
```
echo "hi" > test.txt
curl -b admin.cookie -X POST http://localhost:5000/api/v1/ocr/upload -F "invoice=@test.txt"
```
Response: HTTP 500, `<html><body><pre>Error: Only JPG, JPEG, PNG, and PDF files are allowed.<br> &nbsp;&nbsp;at fileFilter (C:\Users\Admin\Desktop\Clg Mern\server\src\middlewares\upload.middleware.js:25:8) ...`

### File over 10MB
```
dd if=/dev/zero of=big.png bs=1024 count=11500
curl -b admin.cookie -X POST http://localhost:5000/api/v1/ocr/upload -F "invoice=@big.png"
```
Response: HTTP 500, `<html><body><pre>MulterError: File too large<br> &nbsp;&nbsp;at abortWithCode (...) ...`

## Expected
HTTP 400 JSON:
- Type rejection: `{"success":false,"message":"Only JPG, JPEG, PNG, and PDF files are allowed."}`
- Size rejection: `{"success":false,"message":"File too large. Maximum size is 10 MB."}`

## Actual
HTML response with internal stack trace, full paths, and HTTP 500.

## Evidence
- `server/src/app.js` does not register an Express error-handling middleware. Multer errors bubble up to Express's default handler which serves HTML in non-production.
- `error.middleware.js` exists but is empty (file is 0 bytes / 1 line per Read tool).

## Root Cause Hypothesis
The error-handling middleware was never written. Multer errors and any other thrown errors fall through to Express's default HTML response.

## Suggested Fix
1. Implement `error.middleware.js` as `(err, req, res, next) => { ... }` returning JSON.
2. Specifically detect `MulterError` (`err.code === 'LIMIT_FILE_SIZE'` etc.) and `err.message` from `fileFilter`, returning 400.
3. Wire the middleware in `app.js` after all routes via `app.use(errorMiddleware)`.
4. Production: never echo `err.stack`. Dev: log it but don't return it.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- `.txt` upload → HTTP 400, `Content-Type: application/json`, body `{"success":false,"message":"Only JPG, JPEG, PNG, and PDF files are allowed."}`.
- 11.5 MB `.png` upload → HTTP 400 JSON `{"success":false,"message":"File too large. Maximum size is 10 MB."}`.
- No HTML, no stack traces, no absolute paths in either response.
