
declare module "datafile:*mode=array-buffer" { const data: Promise<ArrayBuffer>; export default data; }
declare module "datafile:*mode=arrayBuffer" { const data: Promise<ArrayBuffer>; export default data; }
declare module "datafile:*mode=blob" { const data: Promise<Blob>; export default data; }
declare module "datafile:*mode=json" { const data: Promise<ReturnType<JSON["stringify"]>>; export default data; }
declare module "datafile:*mode=response" { const data: Promise<Response>; export default data; }
declare module "datafile:*mode=text" { const data: Promise<string>; export default data; }