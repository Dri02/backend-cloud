const { Router } = require("express");
  const archiver = require("archiver");
  const { MINIO_BUCKET_NAME } = require("./config.js");
  const {
    uploadFile,
    getFiles,
    getNameFiles,
    downloadFile,
    readFiles,
    checkFileExists,
    getFileURL,
    deleteFile,
    updateFile,
    moveFile,
  } = require("./s3.js");
  const { deleteDir, readJsonFile } = require("./utils.js");
  const router = Router();

  const multer = require("multer");
  const upload = multer({
    dest: "uploads/",
    limits: { fileSize: 10 * 1024 * 1024 }, // Limitar tamaño de archivo a 10 MB
  }).fields([
    { name: "json_screen", maxCount: 1 },
    { name: "json_consultancy", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]);

  router.get("/files/:fileName", async (req, res) => {
    const stream = await getFiles();

    stream.on("data", function (obj) {
      if (obj.name === req.params.fileName) {
        res.json({ files: obj });
      }
    });

    console.log("file found");
  });

  router.get("/filesW/:fileName", async (req, res) => {
    try {
      const stream = await getFiles();
      let found = null;
      await new Promise((resolve, reject) => {
        stream.on("data", (obj) => {
          if (!found && obj.name === req.params.fileName) {
            found = obj;
            resolve();
          }
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      if (found) {
        res.json({ files: found });
      } else {
        res.status(404).json({ error: "Archivo no encontrado" });
      }
      console.log("file found");
    } catch (error) {
      res.status(500).json({ error: "Error al obtener el archivo" });
    }
  });

  router.post("/downloadFolder", async (req, res) => {
    try {
      const objects = await downloadFile(req.body.bucket, req.body.prefix);

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.body.nameZip}"`
      );
      res.setHeader("Content-Type", "application/zip");

      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      archive.pipe(res);

      for await (const obj of objects) {
        const objectName = obj.name;
        const objectStream = await readFiles(objectName);
        const relativePath = objectName.replace(req.body.prefix, "").trim();

        if (relativePath === "") {
          continue;
        }

        archive.append(objectStream, { name: relativePath });
      }

      archive.finalize();
      console.log("Archive download");
    } catch (error) {
      res.status(500).send("Error al descargar el archivo");
    }
  });

  router.post("/downloadFolderW", async (req, res) => {
    try {
      const objects = await downloadFile(req.body.bucket, req.body.prefix);
      res.setHeader("Content-Disposition", `attachment; filename="${req.body.nameZip}"`);
      res.setHeader("Content-Type", "application/zip");
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for await (const obj of objects) {
        const objectName = obj.name;
        const objectStream = await readFiles(req.body.bucket, objectName);
        const relativePath = objectName.replace(req.body.prefix, "").trim();
        if (!relativePath) continue;
        archive.append(objectStream, { name: relativePath });
      }
      await archive.finalize();
      console.log("Archive download");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error al descargar el archivo");
    }
  });

  router.post("/modifyJson", async (req, res) => {
    const modifications = req.body.modifications;
    const prefix = req.body.prefix;
    const notRecursive = req.body.notRecursive;

    try {
      const fileStream = await readFiles(`${prefix}info.json`);
      let data = "";

      fileStream.on("data", (chunk) => {
        data += chunk;
      });

      fileStream.on("end", async () => {
        try {
          const jsonData = JSON.parse(data);
          const oldJsonData = JSON.parse(data);

          for (const modification of modifications) {
            const field = modification.field;
            const value = modification.value;

            jsonData[field] = value;
          }

          const updatedJsonContent = JSON.stringify(jsonData, null, 2);

          await updateFile(`${prefix}info.json`, updatedJsonContent);

          if (notRecursive) {
            for (const modification of modifications) {
              if (
                modification.field === "nameConsultancy" ||
                modification.field === "nameScreen"
              ) {
                if (modification.value !== oldJsonData[modification.field]) {
                  const newPrefix = prefix.replace(
                    /\/[^/]*\/$/,
                    `/${modification.value}/`
                  );
                  await moveFile(prefix, newPrefix);
                }
              }
            }
          }

          res.status(200).json({ message: "JSON updated successfully" });
        } catch (error) {
          res.status(500).json({ error: "Error parsing info.json" });
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).send("Error al actualizar la información");
    }
  });

  router.post("/modifyJsonW", async (req, res) => {
    const modifications = req.body.modifications;
    const prefix = req.body.prefix;
    const notRecursive = req.body.notRecursive;
    try {
      const fileStream = await readFiles(`${prefix}info.json`);
      let data = "";
      await new Promise((resolve, reject) => {
        fileStream.on("data", (chunk) => (data += chunk));
        fileStream.on("end", resolve);
        fileStream.on("error", reject);
      });
      const jsonData = JSON.parse(data);
      const oldJsonData = JSON.parse(data);
      for (const modification of modifications) {
        const { field, value } = modification;
        jsonData[field] = value;
      }
      const updatedJsonContent = JSON.stringify(jsonData, null, 2);
      await updateFile(`${prefix}info.json`, updatedJsonContent);

      if (notRecursive) {
        for (const modification of modifications) {
          if (modification.field === "nameConsultancy" || modification.field === "nameScreen") {
            if (modification.value !== oldJsonData[modification.field]) {
              const newPrefix = prefix.replace(/\/[^/]*\/$/, `/${modification.value}/`);
              await moveFile(prefix, newPrefix);
            }
          }
        }
      }
      res.status(200).json({ message: "JSON updated successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al actualizar la información" });
    }
  });

  router.get("/files", async (req, res) => {
    const data = [];
    const stream = await getFiles();

    stream.on("data", function (obj) {
      data.push(obj);
    });
    stream.on("end", function (obj) {
      res.json({ files: data });
    });
    console.log("files listed");
  });


  router.get("/filesW", async (req, res) => {
    try {
      const data = [];
      const stream = await getFiles();
      await new Promise((resolve, reject) => {
        stream.on("data", (obj) => data.push(obj));
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      // Se elimina la validación de variables no definidas
      res.json({ files: data });
      console.log("files listed");
    } catch (error) {
      res.status(500).json({ error: "Error al listar archivos" });
    }
  });


  router.post("/fileUrl", async (req, res) => {
    try {
      const url = await getFileURL(req.body.bucket, req.body.prefix);

      res.json(url);
    } catch (error) {
      res.status(500).send("Error al obtener la ruta del archivo");
    }
  });

  router.post("/fileUrlW", async (req, res) => {
    try {
      const url = await getFileURL(req.body.bucket, req.body.prefix);
      res.json(url);
    } catch (error) {
      res.status(500).send("Error al obtener la ruta del archivo");
    }
  });

  router.post("/nameFolders", async (req, res) => {
    try {
      const stream = await getNameFiles(req.body.bucket, req.body.prefix);
      const folderNames = [];

      stream.on("data", (obj) => {
        const parts = obj.prefix.split("/");
        folderNames.push(parts[parts.length - 2]);
      });

      stream.on("end", () => {
        res.json(folderNames);
        console.log(folderNames);
        console.log("files listed");
      });
    } catch (error) {
      return res.status(500).send("Error al obtener los nombres de los archivos");
    }
  });

  router.post("/nameFoldersW", async (req, res) => {
    try {
      const stream = await getNameFiles(req.body.bucket, req.body.prefix);
      const folderNames = [];
      await new Promise((resolve, reject) => {
        stream.on("data", (obj) => {
          const parts = obj.prefix.split("/");
          folderNames.push(parts[parts.length - 2]);
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      res.json(folderNames);
      console.log("name folders:", folderNames);
    } catch (error) {
      res.status(500).send("Error al obtener los nombres de los archivos");
    }
  });

  router.post("/contentJSON", async (req, res) => {
    try {
      const fileStream = await readFiles(req.body.prefix);
      let data = "";

      fileStream.on("data", (chunk) => {
        data += chunk;
      });

      fileStream.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          res.json(jsonData);
          console.log("info.json read and parsed");
        } catch (error) {
          res.status(500).json({ error: "Error parsing info.json" });
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Error reading info.json" });
    }
  });

  router.post("/contentJSONW", async (req, res) => {
    try {
      const fileStream = await readFiles(req.body.prefix);
      let data = "";
      await new Promise((resolve, reject) => {
        fileStream.on("data", (chunk) => (data += chunk));
        fileStream.on("end", resolve);
        fileStream.on("error", reject);
      });
      const jsonData = JSON.parse(data);
      res.json(jsonData);
      console.log("info.json read and parsed");
    } catch (error) {
      res.status(500).json({ error: "Error reading info.json" });
    }
  });

  router.post("/contentPNG", async (req, res) => {
    try {
      const fileStream = await readFiles(req.body.prefix);
      const imageData = [];

      fileStream.on("data", (chunk) => {
        imageData.push(chunk);
      });

      fileStream.on("end", () => {
        try {
          const base64Image = Buffer.concat(imageData).toString("base64");
          res.json(base64Image);
          console.log("thumbnail.png read and parsed");
        } catch (error) {
          res.status(500).json({ error: "Error reading file" });
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Error reading file" });
    }
  });

  router.post("/contentPNGW", async (req, res) => {
    try {
      const fileStream = await readFiles(req.body.prefix);
      const imageChunks = [];
      await new Promise((resolve, reject) => {
        fileStream.on("data", (chunk) => {
          imageChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        fileStream.on("end", resolve);
        fileStream.on("error", reject);
      });
      const base64Image = Buffer.concat(imageChunks).toString("base64");
      res.json(base64Image);
      console.log("thumbnail.png read and parsed");
    } catch (error) {
      res.status(500).json({ error: "Error reading file" });
    }
  });

  router.post("/getFoldersData", async (req, res) => {
    try {
      const stream = await getNameFiles(req.body.bucket, req.body.prefix);
      const folderNames = [];
      const folderContent = {};
      const folderThumbnail = {};
      let filterFolderNames = [];

      stream.on("data", (obj) => {
        const parts = obj.prefix.split("/");
        const folderName = parts[parts.length - 2];

        folderNames.push(folderName);
        folderContent[folderName] = [];
        folderThumbnail[folderName] = [];

        if (req.body.isConsultancy) {
          filterFolderNames.push(folderName);
        }
      });

      stream.on("end", async () => {
        for (const folderName of folderNames) {
          const contentStream = await readFiles(
            req.body.bucket,
            `${req.body.prefix}${folderName}/info.json`
          );
          const thumbnailStream = await readFiles(
            req.body.bucket,
            `${req.body.prefix}${folderName}/thumbnail.png`
          );
          let contentData = "";
          let imageData = [];

          contentStream.on("data", (chunk) => {
            contentData += chunk;
          });

          thumbnailStream.on("data", (chunk) => {
            imageData.push(chunk);
          });

          await Promise.all([
            new Promise((resolve) => contentStream.on("end", resolve)),
            new Promise((resolve) => thumbnailStream.on("end", resolve)),
          ]);

          const jsonData = JSON.parse(contentData);
          const base64Image = Buffer.concat(imageData).toString("base64");

          if (req.body.isConsultancy) {
            if (
              req.body.routeName === "Home"
                ? jsonData.view === "Pública" ||
                  req.body.user === jsonData.author ||
                  jsonData.collaborators.includes(req.body.user)
                : req.body.routeName === "MyConsultancies"
                ? req.body.user === jsonData.author
                : jsonData.collaborators.includes(req.body.user)
            ) {
              folderContent[folderName] = jsonData;
              folderThumbnail[folderName] = base64Image;
            } else {
              filterFolderNames = filterFolderNames.filter(
                (filterFolderName) => filterFolderName !== folderName
              );
            }
          } else {
            folderContent[folderName] = jsonData;
            folderThumbnail[folderName] = base64Image;
          }
        }
        res.json({
          folderNames: req.body.isConsultancy ? filterFolderNames : folderNames,
          folderContent,
          folderThumbnail,
        });
      });
    } catch (error) {
      res.status(500).send("Error al leer los archivos");
    }
  });

  router.post("/getFoldersDataW", async (req, res) => {
    try {
      const { bucket, prefix, user } = req.body;
      const stream = await getNameFiles(bucket, prefix);
      const folderNames = [];
      const folderContent = {};
      const folderThumbnail = {};

      stream.on("data", (obj) => {
        const parts = obj.prefix.split("/");
        const folderName = parts[parts.length - 2];
        if (folderName) {
          folderNames.push(folderName);
          folderContent[folderName] = {};
          folderThumbnail[folderName] = "";
        }
      });

      stream.on("end", async () => {
        for (const folderName of folderNames) {
          const infoPath = `${prefix}${folderName}/info.json`;
          let jsonData = {};
          try {
            const infoStream = await readFiles(bucket, infoPath);
            let dataStr = "";
            infoStream.on("data", (chunk) => (dataStr += chunk));
            await new Promise((resolve) => infoStream.on("end", resolve));
            jsonData = JSON.parse(dataStr);
          } catch (error) {
          }

          const thumbnailPath = `${prefix}${folderName}/thumbnail.png`;
          let base64Image = "";
          try {
            const thumbStream = await readFiles(bucket, thumbnailPath);
            const imageChunks = [];
            thumbStream.on("data", (chunk) => imageChunks.push(chunk));
            await new Promise((resolve) => thumbStream.on("end", resolve));
            base64Image = Buffer.concat(imageChunks).toString("base64");
          } catch (error) {
          }

          let hasVideo = false;
          let videoName = "";
          if (jsonData.nameScreen) {
            if (!(jsonData.view === "Privada" && user !== jsonData.author)) {
              const obsPrefix = `${prefix}${folderName}/Observaciones/${jsonData.nameScreen}/`;
              const obsStream = await getNameFiles(bucket, obsPrefix);
              const obsObjects = [];
              obsStream.on("data", (obj) => obsObjects.push(obj));
              await new Promise((resolve) => obsStream.on("end", resolve));
              for (const fileObj of obsObjects) {
                const lowerName = fileObj.name.toLowerCase();
                if (lowerName.endsWith(".mp4") || lowerName.endsWith(".mov")) {
                  hasVideo = true;
                  const parts = fileObj.name.split("/");
                  videoName = parts[parts.length - 1];
                  break;
                }
              }
            }
          }

          folderContent[folderName] = {
            ...jsonData,
            hasVideo,
            videoName,
          };
          folderThumbnail[folderName] = base64Image;
        }
        return res.json({
          folderNames,
          folderContent,
          folderThumbnail,
        });
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Error al leer los archivos");
    }
  });

  router.post("/files", async (req, res) => {
    console.log("CCC");
    try {
      // Usar directamente el objeto de cada campo (no es un array)
      const screenJsonData = await readJsonFile(
        req.files["json_screen"].tempFilePath
      );
      const consultancyJsonData = await readJsonFile(
        req.files["json_consultancy"].tempFilePath
      );
  
      const screenName = screenJsonData.nameScreen;
      const consultancyName = consultancyJsonData.nameConsultancy;
  
      const folderPathScreen = `Consultorías TI/${consultancyName}/Observaciones/${screenName}`;
      const folderPathConsultancy = `Consultorías TI/${consultancyName}`;
  
      // Se pasa el objeto del thumbnail a checkFileExists
      const thumbnailExistsInConsultancy = await checkFileExists(
        req.body.bucket,
        req.files["thumbnail"],
        folderPathConsultancy
      );
  
      // Subir los archivos utilizando el objeto completo (express-fileupload los provee con tempFilePath y name)
      await uploadFile(req.body.bucket, req.files["json_screen"], folderPathScreen);
      await uploadFile(req.body.bucket, req.files["video"], folderPathScreen);
      await uploadFile(req.body.bucket, req.files["thumbnail"], folderPathScreen);
      await uploadFile(req.body.bucket, req.files["json_consultancy"], folderPathConsultancy);
  
      if (!thumbnailExistsInConsultancy) {
        await uploadFile(req.body.bucket, req.files["thumbnail"], folderPathConsultancy);
      }
  
      deleteDir("./uploads");
  
      res.json({ message: "upload file" });
      console.log("upload file");
    } catch (error) {
      console.error("Error al procesar archivos JSON:", error);
      return res.status(500).json({ error: "Error al procesar archivos JSON" });
    }
  });  

  router.post("/deleteFile", async (req, res) => {
    try {
      await deleteFile(req.body.bucket, req.body.prefix);
      console.log("deleted file");
    } catch (error) {
      return res.status(500).send("Error al eliminar el archivo");
    }
  });

  module.exports = router;
