/** Shared file and storage service (APPLICATION-ARCHITECTURE §18). Server only. */
export {
  completeUpload,
  createUpload,
  deleteFile,
  getDownloadUrl,
  listFiles,
  readTextFiles,
  TEXT_FILE_TYPES,
  type FileItem,
  type FileText,
  type UploadTicket,
} from './files';
