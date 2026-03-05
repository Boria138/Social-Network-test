// Server configuration and constants

const FILE_FORMATS = {
  // Audio formats for voice messages and file uploads
  AUDIO: {
    mimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/webm',
      'audio/opus',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/x-flac',
      'audio/x-ms-wma',
      'audio/vnd.wave',
      'audio/3gpp',
      'audio/3gpp2'
    ],
    extensions: ['.mp3', '.ogg', '.webm', '.opus', '.m4a', '.wav', '.aac', '.flac', '.wma', '.3gp', '.3g2']
  },
  // Video formats
  VIDEO: {
    mimeTypes: [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/mpeg',
      'video/ogg',
      'video/3gpp',
      'video/3gpp2'
    ],
    extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.mpeg', '.mpg', '.ogv', '.3gp', '.3g2']
  },
  // Image formats
  IMAGE: {
    mimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/x-icon',
      'image/tiff',
      'image/heic',
      'image/heif'
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.tif', '.heic', '.heif']
  },
  // Document formats
  DOCUMENT: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/html',
      'text/css',
      'text/csv',
      'text/markdown',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation'
    ],
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.htm', '.css', '.csv', '.md', '.rtf', '.odt', '.ods', '.odp']
  },
  // Archive formats
  ARCHIVE: {
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/x-7z-compressed',
      'application/x-gzip',
      'application/gzip',
      'application/x-bzip2',
      'application/x-xz',
      'application/vnd.ms-cab-compressed'
    ],
    extensions: ['.zip', '.rar', '.tar', '.7z', '.gz', '.gzip', '.bz2', '.xz', '.cab', '.iso']
  },
  // Other/Executable formats
  OTHER: {
    mimeTypes: [
      'application/octet-stream',
      'application/x-executable',
      'application/x-msdownload',
      'application/x-sh',
      'application/x-shellscript',
      'application/json',
      'application/xml',
      'application/javascript'
    ],
    extensions: ['.bin', '.exe', '.dll', '.so', '.sh', '.json', '.xml', '.js']
  }
};

// Combined list of all allowed MIME types
const ALLOWED_MIME_TYPES = [
  ...FILE_FORMATS.IMAGE.mimeTypes,
  ...FILE_FORMATS.DOCUMENT.mimeTypes,
  ...FILE_FORMATS.AUDIO.mimeTypes,
  ...FILE_FORMATS.VIDEO.mimeTypes,
  ...FILE_FORMATS.ARCHIVE.mimeTypes
];

// Combined list of all allowed extensions
const ALLOWED_EXTENSIONS = [
  ...FILE_FORMATS.IMAGE.extensions,
  ...FILE_FORMATS.DOCUMENT.extensions,
  ...FILE_FORMATS.AUDIO.extensions,
  ...FILE_FORMATS.VIDEO.extensions,
  ...FILE_FORMATS.ARCHIVE.extensions
];

module.exports = {
  FILE_FORMATS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS
};
