import { Request, Response } from 'express';
import {onError, onSuccess, onBadRequest, onNotFound} from "../libs/res-handler";
import {runPlaywrightProject, stopPlaywrightExecution, validateProjectExists} from "../libs/command-executor";
import fs from "fs";
import paths from "../configs/pahts.config";
import {emitChangeService, Payload} from "../services/socket-sync.service";

export const runProject = async (req: Request, res: Response) => {
  try{
    const { project } = req.params;
    const {workers=1, retries=0, headed=false} = req.body;

    const playWrightFolder = process.env.PLAYWRIGHT_PROJECT_ROOT_FOLDER;
    if (!playWrightFolder) {return onBadRequest("No Playwright environment set.", res);}

    // Validate that the project exists in Playwright config
    /*const projectExists = await validateProjectExists(project, playWrightFolder);

    if (!projectExists) {
      return onNotFound(
        `Project "${project}" not found in Playwright configuration. Please check the project name and try again.`,
        res
      );
    }*/
    runPlaywrightProject(project, workers, retries, headed).then((child)=>{
      //console.log(child);
      fs.mkdirSync(paths.logsFolder, { recursive: true });
      fs.writeFileSync(paths.logFilename(String(child.pid)), `Execution started for project: ${project} with PID: ${child.pid}\nat:${new Date().toLocaleString()}\n`);
      const stream = fs.createWriteStream(paths.logFilename(String(child.pid)), {
        flags: 'a'
      });
      child.stderr.on('data', (data) => {
        //return onError(data.toString(), __filename, "runBot", res);
        //console.error(data.toString())
      });
      child.stdout.on('data', (data) => {

        const text = data.toString();
        stream.write(text);
        console.log(text);
          emitChangeService({room:'oscar', event:"sync:change", data:{
            text,
            }} as Payload)
        });
      child.stdout.on('end', ()=>{
        stream.write(`Execution ended at: ${new Date().toLocaleString()}`);
        stream.end();
      })
      onSuccess({ message: `Bot execution started for project: ${project} on ${child.pid}` }, res);
    })


  }catch (e) {
    onError(e, __filename, "runBot", res);
  }
}

export const stopExecution = async (req: Request, res: Response) => {
  try{
    const {serviceId} = req.params;
    stopPlaywrightExecution(serviceId);
    onSuccess({ message: `Bot execution stopped for serviceId: ${serviceId}` }, res);
  }catch (e) {
    onError(e, __filename, "stopExecution", res);
  }
}

export const showLastExecution = async (req: Request, res: Response) => {
  try{

  }catch (e) {
    onError(e, __filename, "showLastExecution", res);
  }
}
