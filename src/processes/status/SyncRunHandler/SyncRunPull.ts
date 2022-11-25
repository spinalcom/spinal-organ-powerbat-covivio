/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import moment = require('moment');
import {
  SpinalContext,
  SpinalGraph,
  SpinalGraphService,
  SpinalNode,
  SpinalNodeRef,
  SPINAL_RELATION_PTR_LST_TYPE
} from 'spinal-env-viewer-graph-service';

import type OrganConfigModel from '../../../model/OrganConfigModel';

import {AxiosInstance} from 'axios';
import { NetworkService } from "spinal-model-bmsnetwork";
//import {InputDataDevice } from "../../../model/InputData/InputDataModel/InputDataDevice"
//import { InputDataEndpoint } from '../../../model/InputData/InputDataModel/InputDataEndpoint';
import {
  InputDataDevice,
  InputDataEndpoint,
  InputDataEndpointGroup,
  InputDataEndpointDataType,
  InputDataEndpointType,
} from '../../../model/InputData/InputDataModel/InputDataModel';
import { axiosInstance } from '../../../utils/axiosInstance';
/**
 * Main purpose of this class is to pull tickets from client.
 *
 * @export
 * @class SyncRunPull
 */
export class SyncRunPull {
  graph: SpinalGraph<any>;
  config: OrganConfigModel;
  interval: number;
  running: boolean;
  mapBuilding: Map<number, string>;
  axiosInstance : AxiosInstance;
  clientBuildingId : number;
  nwService : NetworkService;
  private deviceId: string;
  private endpoints : string[];
  private sandBoxDeviceId : string;
  private mapping : Map<string, string>;

  constructor(graph: SpinalGraph<any>, config: OrganConfigModel, nwService :NetworkService) {
    this.graph = graph;
    this.config = config;
    this.running = false;
    this.nwService = nwService;
    this.sandBoxDeviceId = "127591548511ffad2af6c7f74c0b7e45a03d690f";
    this.mapping = new Map<string, string>([
      ["Energie General", "098cba82bc997a03d7b30847a3a0d07ae330c9e2"],
      ["ENERGIE PC", "2af45dacea31c91cb0440c102f0ebae629ece62e"]
    ]);
    this.endpoints = [];
  }

  async getSpinalGeo(): Promise<SpinalContext<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.id.get() === this.config.spatialContextID?.get()) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    const context = await this.graph.getContext('spatial');
    if (!context) throw new Error('Context Not found');
    return context;
  }

  

  async getContext(): Promise<SpinalNode<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.id.get() === this.config.contextId.get()) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error('Context Not found');
  }

  private waitFct(nb: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve();
        },
        nb >= 0 ? nb : 0
      );
    });
  }

  /**
   * Initialize the context (fill the SpinalGraphService)
   *
   * @return {*}  {Promise<void>}
   * @memberof SyncRunPull
   */
  async initContext(): Promise<void> {
    const context = await this.getContext();
    await context.findInContext(context, (node): false => {
      // @ts-ignore
      SpinalGraphService._addNode(node);
      return false;
    });
  }


  async createSandboxIfNotExist() {
    const context = await this.getContext();
    const devices = await context.findInContext(
      context,
      (node) => node.info.name.get() === "Device Demo"
    );
    if (devices.length > 0){
      console.log("Device already exists", devices[0].info.id.get());
      return;
    } 
    else {
      console.log("Creating Device and sandbox endpoints");
      const device = new InputDataDevice("Device Demo","device")
      const dataEndpoint1: InputDataEndpoint = new InputDataEndpoint(
        'Compteur Etage 1',
        8.35,
        'kWh',
        InputDataEndpointDataType.Real,
        InputDataEndpointType.Power,
        `id-Compteur Etage 1`,
        '',
      );

      const dataEndpoint2: InputDataEndpoint = new InputDataEndpoint(
        'Compteur Etage 2',
        8.35,
        'kWh',
        InputDataEndpointDataType.Real,
        InputDataEndpointType.Power,
        `id-Compteur Etage 2`,
        '',
      );

      device.children.push(dataEndpoint1,dataEndpoint2);
      await this.nwService.updateData(device);
      return;
    }
  }

  async sendEndpointData() {
    for (const endpoint of this.endpoints) {
      const node = await this.nwService.getData(endpoint);
      //const timeseries = await this.nwService.getTimeseries(endpoint);
      const time = new Date(); 
      const body = {version: 1,
                    type: "GENERIC_DECIMAL",
                    datas: [
                      {
                        ts: time,
                        message: node.currentValue.get()
                      }
                    ]};
      console.log(body)
      const streamId = this.mapping.get(node.name.get());
      try {
        await axiosInstance.post(
          `rest/v1/datas/devices/${this.sandBoxDeviceId}/streams/${streamId}/values`
          ,body);
      }
      catch (e) {
        console.log(e);
      }
    }
  }

  async bindEndpointData(){
    for (const endpoint of this.endpoints) {
      const node = await this.nwService.getData(endpoint);
      //const timeseries = await this.nwService.getTimeseries(endpoint);
      const time = new Date(); 
      const body = {version: 1,
                    type: "GENERIC_DECIMAL",
                    datas: [
                      {
                        ts: time,
                        message: node.currentValue.get()
                      }
                    ]};
      console.log(body)
      const streamId = this.mapping.get(node.name.get());

      let currentValueModel = node.info.currentValue;
      currentValueModel.bind( async () =>{
        try {
          await axiosInstance.post(
            `rest/v1/datas/devices/${this.sandBoxDeviceId}/streams/${streamId}/values`
            ,body);
        }
        catch (e) {
          console.log(e);
        }
      })
      
    }
  }

  async init(): Promise<void> {
    await this.initContext();
    console.log("Context init Done...")
    //await this.createSandboxIfNotExist();
    const context = await this.getContext();

    const endpoints = await context.findInContext(context,
      (node) => node.info.name.get() === "Energie General" || node.info.name.get() === "ENERGIE PC" 
    );
    /*const devices = await context.findInContext(
      context,
      (node) => node.info.name.get() === "Device Demo"
    );
    if (devices.length > 0){
      console.log("Device already exists", devices[0].info.id.get());
      this.deviceId = devices[0].info.id.get();
    }
    const endpoints = await this.nwService.getEndpoint(this.deviceId);
    this.endpoints = endpoints;
    this.sendEndpointData();
    */
    for (const endpoint of endpoints) {
      this.endpoints.push(endpoint.info.id.get());
    }
    this.sendEndpointData();
    try {

    } catch (e) {
      console.error(e);
    }
  }

  async run(): Promise<void> {
    this.running = true;
    const timeout = this.config.client.pullInterval.get();
    await this.waitFct(timeout);
    while (true) {
      if (!this.running) break;
      const before = Date.now();
      try {

        console.log("Sending Data...");
        this.sendEndpointData();
        this.config.client.lastSync.set(Date.now());
      } catch (e) {
        console.error(e);
        await this.waitFct(1000 * 60);
      } finally {
        const delta = Date.now() - before;
        const timeout = this.config.client.pullInterval.get() - delta;
        await this.waitFct(timeout);
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}
export default SyncRunPull;
