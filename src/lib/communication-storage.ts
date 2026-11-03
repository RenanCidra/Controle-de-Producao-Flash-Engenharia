import { getStorage } from 'firebase-admin/storage';
import './firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json';

const configuredBucket = (
  process.env.COMMUNICATIONS_STORAGE_BUCKET?.trim() ||
  process.env.COMMUNICATIONS_STORAGE?.trim() ||
  firebaseConfig.storageBucket ||
  ''
).replace(/^gs:\/\//, '');

export const communicationStorageBucket = () => getStorage().bucket(configuredBucket);
