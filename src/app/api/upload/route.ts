import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const response = await new Promise<NextResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'soilguard_uploads' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary error', error);
            resolve(NextResponse.json({ message: 'Upload failed', error }, { status: 500 }));
          } else {
            resolve(NextResponse.json({ message: 'File uploaded', url: result?.secure_url }, { status: 200 }));
          }
        }
      );
      
      const { Readable } = require('stream');
      const readableStream = new Readable({
        read() {
          this.push(buffer);
          this.push(null);
        }
      });
      readableStream.pipe(uploadStream);
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ message: 'Error processing upload', error: error.message }, { status: 500 });
  }
}
