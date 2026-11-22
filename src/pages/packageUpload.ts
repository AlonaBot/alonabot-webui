/** buildPackageUpload 保留上传文件字节，由浏览器生成 multipart boundary。 */
export function buildPackageUpload(input: {
  archive: File;
  confirm: boolean;
  replace?: boolean;
}): FormData {
  const form = new FormData();
  form.append('archive', input.archive);
  form.append('confirm', String(input.confirm));
  if (input.replace !== undefined) form.append('replace', String(input.replace));
  return form;
}
