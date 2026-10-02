/* ============================================================================
   Exportación de documentos: PDF y Excel (.xlsx), sin dependencias.

   POR QUÉ A MANO Y NO CON UNA LIBRERÍA:
   El proyecto se sirve sin build step y tiene presupuesto de tamaño medido en
   KB reales de descarga. `pdfkit` (~1,5 MB) y `exceljs` (~2 MB) no caben, y
   además solo se usan aquí. Lo que hace falta es acotado:

     · PDF   → un documento de una página con cabecera, tabla y totales. Se
               escribe el PDF directamente (objetos + content stream).
     · XLSX  → es un ZIP con XML dentro. Se arma el ZIP sin comprimir (método
               "stored"), que es válido y no necesita zlib manual.

   Esto NO es un generador de PDFs general: si algún día hace falta maquetar
   algo complejo, la conversación cambia y habrá que justificar la dependencia.

   OJO CON EL TEXTO: el PDF usa WinAnsi (Latin-1). Un carácter fuera de ese
   rango hay que sustituirlo o corrompe el archivo. `soloLatin` se encarga.
   ========================================================================= */

/* ---------- utilidades de texto ---------- */

/* El PDF que generamos codifica en WinAnsi (Latin-1). Cualquier cosa fuera de
   ese rango —emojis, CJK, comillas tipográficas— rompería el archivo, así que
   se sustituye por su equivalente ASCII antes de escribir. */
const soloLatin = (v) => String(v == null ? "" : v)
  .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
  .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
  .replace(/[\u2013\u2014\u2212]/g, "-")
  .replace(/\u2026/g, "...")
  .replace(/[\u00A0\u2007\u202F]/g, " ")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/* Escapa lo que en el content stream del PDF tiene significado especial. */
const escPdf = (t) => soloLatin(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  .replace(/\r?\n/g, " ");

const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- PDF ---------- */

/* Ancho de un texto en Helvetica a un tamaño dado. Se usan las tablas de
   anchos de las 14 fuentes estándar (aquí solo hacen falta los caracteres
   latinos usuales); es una aproximación suficiente para alinear columnas. */
const ANCHOS_HELV = { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722, "I": 278,
  "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778, "R": 722,
  "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667, "Y": 667, "Z": 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
  "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556, "i": 222,
  "j": 222, "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333,
  "s": 500, "t": 278, "u": 556, "v": 500, "w": 722, "x": 500, "y": 500, "z": 500,
  "{": 334, "|": 260, "}": 334, "~": 584 };
const anchoTexto = (t, tam, negrita) => {
  let w = 0;
  for (const ch of soloLatin(t)) w += ANCHOS_HELV[ch] || 556;
  return (w / 1000) * tam * (negrita ? 1.06 : 1);
};

/* Corta un texto para que quepa en `max` puntos, añadiendo puntos suspensivos. */
const recortar = (t, max, tam, negrita) => {
  let s = soloLatin(t);
  if (anchoTexto(s, tam, negrita) <= max) return s;
  while (s.length > 1 && anchoTexto(s + "...", tam, negrita) > max) s = s.slice(0, -1);
  return s + "...";
};

/* Construye un PDF 1.4 de una sola página (o varias) a partir de operaciones
   de dibujo. `ops` es una lista de líneas del content stream. */
function armarPdf(ops, { ancho = 595.28, alto = 841.89 } = {}) {
  const contenido = ops.join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho.toFixed(2)} ${alto.toFixed(2)}] ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n \n";
  out += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* Convierte a bytes Latin-1 (lo que espera el content stream). */
const b = (t) => Buffer.from(soloLatin(t), "latin1");

/* ---------- XLSX ---------- */

/* Escapa el texto para el XML de una celda y quita los caracteres de control
   que Excel rechaza (el archivo se abriría "dañado"). */
const escXml = (t) => String(t == null ? "" : t)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const letraCol = (n) => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

const celda = (ref, valor) => {
  if (valor === null || valor === undefined || valor === "") return `<c r="${ref}"/>`;
  if (typeof valor === "number" && Number.isFinite(valor)) return `<c r="${ref}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(valor)}</t></is></c>`;
};

/* ZIP sin compresión (método 0/stored). Es un ZIP válido: Excel lo abre igual,
   y evita arrastrar una implementación de DEFLATE. */
function zip(files) {
  const partes = []; const central = []; let offset = 0;
  const crcTabla = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTabla[(c ^ buf[i]) & 0xFF];
    return (c ^ -1) >>> 0;
  };
  const u16 = (n) => { const x = Buffer.alloc(2); x.writeUInt16LE(n & 0xFFFF); return x; };
  const u32 = (n) => { const x = Buffer.alloc(4); x.writeUInt32LE(n >>> 0); return x; };
  for (const f of files) {
    const nombre = Buffer.from(f.nombre, "utf8");
    const datos = Buffer.isBuffer(f.datos) ? f.datos : Buffer.from(f.datos, "utf8");
    const crc = crc32(datos);
    const cab = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0), nombre]);
    partes.push(cab, datos);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nombre]));
    offset += cab.length + datos.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0)]);
  return Buffer.concat([...partes, cd, fin]);
}

/* Construye un .xlsx real a partir de filas (array de arrays). */
function armarXlsx(filas, { hoja = "Datos" } = {}) {
  const cuerpo = filas.map((fila, r) =>
    `<row r="${r + 1}">` + fila.map((v, c) => celda(letraCol(c) + (r + 1), v)).join("") + "</row>"
  ).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cuerpo}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(hoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  /* Estilos mínimos: sin este archivo Excel avisa de que el libro está dañado. */
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
  return zip([
    { nombre: "[Content_Types].xml", datos: contentTypes },
    { nombre: "_rels/.rels", datos: rels },
    { nombre: "xl/workbook.xml", datos: workbook },
    { nombre: "xl/_rels/workbook.xml.rels", datos: wbRels },
    { nombre: "xl/styles.xml", datos: styles },
    { nombre: "xl/worksheets/sheet1.xml", datos: sheet },
  ]);
}

/* ---------- CSV ---------- */

/* Excel en español abre el CSV con punto y coma y espera BOM UTF-8 para no
   romper los acentos. Con coma y sin BOM, "Pérez" sale como "PÃ©rez". */
function armarCsv(filas, { separador = ";" } = {}) {
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[";,\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const cuerpo = filas.map((f) => f.map(esc).join(separador)).join("\r\n");
  return Buffer.concat([Buffer.from("\uFEFF", "utf8"), Buffer.from(cuerpo, "utf8")]);
}

module.exports = { armarPdf, armarXlsx, armarCsv, escPdf, b, anchoTexto, recortar, soloLatin, money };
