import { getStorage } from 'firebase-admin/storage';
import './firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json';

const bucketName = process.env.COMMUNICATIONS_STORAGE_BUCKET?.trim() || firebaseConfig.storageBucket;

export const communicationStorageBucket = () => getStorage().bucket(bucketName);
