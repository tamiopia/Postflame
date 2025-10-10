import axios from 'axios';

export async function uploadToPostman(collection: any, apiKey: string) {
  try {
    const res = await axios.post(
      'https://api.getpostman.com/collections',
      { collection },
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`🚀 Collection uploaded to Postman: ${res.data.collection.uid}`);
    return res.data;
  } catch (err: any) {
    console.error('❌ Failed to upload to Postman:', err.message);
  }
}
