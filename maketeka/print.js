// PNG physical resolution is stored in whole pixels per metre.
export async function printPng(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = new DataView(bytes.buffer);
  const physical = new Uint8Array(21);
  const view = new DataView(physical.buffer);
  view.setUint32(0,9);
  physical.set([112,72,89,115],4);
  view.setUint32(8,11811);
  view.setUint32(12,11811);
  physical[16]=1;
  let crc=0xffffffff;
  for(const byte of physical.subarray(4,17)){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  view.setUint32(17,~crc);
  const chunks=[bytes.subarray(0,8)];
  for(let pos=8;pos<bytes.length;){
    const end=pos+12+header.getUint32(pos),type=header.getUint32(pos+4);
    if(type!==0x70485973)chunks.push(bytes.subarray(pos,end));
    if(type===0x49484452)chunks.push(physical);
    pos=end;
  }
  return new Blob(chunks,{type:'image/png'});
}
