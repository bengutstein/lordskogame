# NYC Photo Drop

Simple Node + Leaflet app that plots photo uploads on a NYC map and tracks Ben vs Jake.

Uploads are now stored in Vercel Blob so they persist on Vercel deployments.

## Run the app
For the production-like flow (uses the serverless functions and Blob):
1) Install deps: `npm install`
2) Set `BLOB_READ_WRITE_TOKEN` (from Vercel > Storage > Blob)
3) Run `vercel dev` from the project root

Legacy local-only flow (writes to disk, no Blob):
`npm start`  
This serves `public/` on http://localhost:3000

## Add a photo via terminal
Use the helper script to copy your photo into `public/uploads`, record its lat/lng, and update `data/uploads.json`:
```
node scripts/add-upload.js --uploader Ben --lat 40.7128 --lng -74.0060 --photo /full/path/to/image.jpg
```
- `--uploader` accepts Ben or Jake (others will render in gray).
- The script copies the image into `public/uploads/` and stores a relative URL so the browser can load it.
- Data lives in `data/uploads.json`; each entry keeps `createdAt` for recency and `originalPath` for reference.

## Add a photo in the browser
- Open the app, fill uploader, enter a NYC street address (we auto-append NYC), choose an image, and click Upload. The server geocodes the address, saves the file to `public/uploads/`, and adds the entry to `data/uploads.json`.
- After upload, click Refresh uploads to see it on the map.

## UI notes
- Leaflet map centers on NYC with colored circle markers (blue for Ben, red for Jake).
- Clicking a marker shows the photo and metadata.
- Sidebar shows the leaderboard and up to three most recent uploads per person.
- Use the "Refresh uploads" button to pull the latest JSON without restarting the server.

## Deploying to Vercel with uploads
- Create a Vercel Blob store and grab the `BLOB_READ_WRITE_TOKEN`.
- Add that token to the project (Vercel dashboard > Settings > Environment Variables).
- Deploy with `vercel --prod` (static assets come from `public/`, APIs live in `api/`).
- The `/api/upload` function writes images to Blob storage and appends metadata to `data/uploads.json` in Blob. `/api/uploads` reads that JSON.
