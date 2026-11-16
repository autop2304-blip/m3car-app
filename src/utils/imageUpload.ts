export const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (file.size === 0) return 'File 0 byte! Simpan dari Google Photos ke Galeri dulu bos.';
  if (file.size > MAX_FILE_SIZE) return 'File kegedean bos max 15MB';
  if (file.name.match(/\.(pdf|mp4|zip)$/i)) return 'Harus foto bos!';
  return null;
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('Timeout')); }, 15000);
    img.onload = () => { clearTimeout(t); URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { clearTimeout(t); URL.revokeObjectURL(url); reject(new Error('Gagal baca')); };
    img.src = url;
  });
}

export async function compressImageForUpload(file: File) {
  let workingBlob: Blob = file;
  try { await decodeImage(file); } catch {
    try {
      const heic2any = (await import('heic2any')).default;
      const c = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      workingBlob = Array.isArray(c) ? c[0] : c as Blob;
    } catch {}
  }
  const img = await decodeImage(workingBlob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let w = img.naturalWidth, h = img.naturalHeight;
  const MAX_DIM = 1280;
  if (Math.max(w,h) > MAX_DIM) { const s = MAX_DIM/Math.max(w,h); w=Math.round(w*s); h=Math.round(h*s); }
  canvas.width=w; canvas.height=h;
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(img,0,0,w,h);
  const outBlob = await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/jpeg',0.75));
  const finalFile = new File([outBlob], file.name.replace(/\.[^/.]+$/,'')+'.jpg', {type:'image/jpeg'});
  const previewUrl = URL.createObjectURL(finalFile);
  return { file: finalFile, previewUrl, info: `${(file.size/1024).toFixed(0)}KB -> ${(finalFile.size/1024).toFixed(0)}KB` };
}