import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });

const putObject = async (key, body, contentType) => {
  await s3.send(
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
};

// Signed with the time rounded down to the hour, so the URL stays identical
// for that hour and browsers can cache the image instead of re-downloading
// it on every page load.
const signedUrl = async (key) => {
  const signingDate = new Date();
  signingDate.setMinutes(0, 0, 0);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), {
    expiresIn: 7200,
    signingDate,
  });
};

export { putObject, signedUrl };
