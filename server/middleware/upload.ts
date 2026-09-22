import multer from 'multer';

// Use in-memory buffer storage with 20 MB size limit
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file extension '.${ext}'. Supported formats: .csv, .xlsx, .xls, .pdf`));
    }
  },
});
