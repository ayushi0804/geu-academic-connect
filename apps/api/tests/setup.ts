import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/placeholder-replaced-by-memory-server';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'geu-academic-connect-test-uploads');
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
