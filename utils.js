const fs = require("fs"); // Para funciones síncronas
const fsp = require("fs").promises; // Para funciones asíncronas basadas en promesas
const path = require("path");

function deleteDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      deleteDir(filePath);
    } else {
      fs.unlinkSync(filePath);
      console.log("File Deleted!");
    }
  }

  fs.rmdirSync(dirPath);
  console.log("Folder Deleted!");
}

async function readJsonFile(filePath) {
  try {
    const data = await fsp.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error al leer el archivo JSON en ${filePath}:`, error);
    throw new Error("Error al leer el archivo JSON");
  }
}

module.exports = {
  deleteDir,
  readJsonFile,
};