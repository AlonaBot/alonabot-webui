/** buildPackageUpload 保留上传文件字节，由浏览器生成 multipart boundary。 */
export function buildPackageUpload(input: {
  archive: File;
  release: File;
  signature: File | null;
  publicKey: string;
  confirm: boolean;
  replace?: boolean;
}): FormData {
  const form = new FormData();
  form.append('archive', input.archive);
  form.append('release', input.release);
  if (input.signature) form.append('signature', input.signature);
  if (input.publicKey.trim()) form.append('public_key', input.publicKey.trim());
  form.append('confirm', String(input.confirm));
  if (input.replace !== undefined) form.append('replace', String(input.replace));
  return form;
}
