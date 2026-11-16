# Media

Photos and videos. Admin and families upload them, media checks they are real, resizes photos to WebP, turns videos into MP4 a browser can play with a poster frame, and serves the ready files. Catalog keeps only asset IDs and builds the links itself.

## Who does what

| Who    | What                                               |
| ------ | -------------------------------------------------- |
| Admin  | Uploads photos and videos, and sees every asset    |
| Family | Uploads photos and videos, and sees only their own |
| Anyone | Loads ready files from `/files/{assetId}/{name}`   |

## Endpoints

Paths as the gateway shows them, under `/api`. `openapi.yaml` has every field and answer.

| Endpoint                                 | Who           | What                                          |
| ---------------------------------------- | ------------- | --------------------------------------------- |
| `POST /media/uploads`                    | Admin, Family | An upload link for one photo or video         |
| `POST /media/uploads/{assetId}/complete` | Admin, Family | Check and process the uploaded file           |
| `GET /media/assets/{assetId}`            | Admin, Family | The asset's status and, once ready, its links |

Two more paths are not in the spec and are served by media directly, not through the gateway, like a storage bucket would be:

- `PUT /uploads/{assetId}?token=…` takes the file. The token is in the `uploadUrl` from `POST /media/uploads`, works once, and stops working after an hour. Send the `Content-Type` you asked for, and no more bytes than `sizeBytes`.
- `GET /files/{assetId}/{name}` serves ready files: `thumb.webp`, `card.webp` and `hero.webp` (400, 800 and 1600 px wide) for photos, `video.mp4` and `poster.webp` for videos.

## Uploading

1. `POST /api/media/uploads` with `kind`, `contentType` and `sizeBytes`. Photos: JPEG, PNG or WebP up to 15 MB. Videos: MP4 or MOV up to 500 MB.
2. `PUT` the file to `uploadUrl` with the `headers` it gave you.
3. `POST /api/media/uploads/{assetId}/complete`. It answers `202` with status `processing`.
4. Poll `GET /api/media/assets/{assetId}` until status is `ready` or `rejected` (with `rejectReason`). Videos take about as long as they play.

Then put the asset ID on a Yai or class in catalog (`photoAssetIds`, `introVideoAssetId`, `photoAssetId`).

## Running it

`npm run up` starts it in Docker on port 3006, with ffmpeg, and keeps files in the `media` volume. To run it on this machine instead, `npm run media`; it needs `ffmpeg` and `ffprobe` on your PATH for videos, and keeps files in `.media/` at the repo root.

| Variable          | Default                 | What                                  |
| ----------------- | ----------------------- | ------------------------------------- |
| `PORT`            | `3006`                  |                                       |
| `MONGO_URL`       |                         | Database `media`                      |
| `AUTH_PUBLIC_KEY` |                         | Checks tokens                         |
| `MEDIA_DIR`       | `.media/`               | Uploads and ready files               |
| `MEDIA_SELF_URL`  | `http://localhost:3006` | This service as the browser sees it   |
| `WEB_ORIGIN`      | `http://localhost:5173` | The web app, allowed to `PUT` uploads |

Catalog's `MEDIA_PUBLIC_URL` must be `{MEDIA_SELF_URL}/files`.

## Sample photos

`samples/` holds the photos for catalog's sample Yais and classes, each named after the asset ID catalog's seed uses. `samples/CREDITS.md` lists where each came from and its licence. After `npm run up`:

```bash
docker compose -f infra/docker-compose.yml exec media node scripts/seed.js
npm run seed -w @yais-kitchen/catalog
```

## Not built yet

`/internal/media/signed-links` and `/internal/media/recording-output`, which live-class uses for class recordings, need private S3-style storage. Live-class turns recording off while `MEDIA_URL` is unset for it.
