'use strict';

const axios = require('axios');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');

const LitterRobotDevice = require('./litter-robot-device');

const CLIENT_ID = 'IYXzWN908psOm7sNpe4G.ios.whisker.robots';
const CLIENT_SECRET = 'C63CLXOmwNaqLTB2xXo6QIWGwwBamcPuaul';

const GRANT_TYPE_PASSWORD = 'password';
const GRANT_TYPE_REFRESH = 'refresh_token';

const X_API_KEY = 'p7ndMoj61npRZP5CVz9v4Uj0bG769xy6758QRBPb';

const AUTH_ENDPOINT = 'https://autopets.sso.iothings.site/oauth/token';
const API_ENDPOINT = 'https://v2.api.whisker.iothings.site/';

axios.defaults.headers.common['x-api-key'] = X_API_KEY;

class LitterRobotConnect {

    constructor({username, password}, log) {
        const connect = this;

        if (!username) {
            throw new Error('No username provided!');
        }
        if (!password) {
            throw new Error('No password provided!');
        }

        connect.username = username;
        connect.password = password;
        connect.log = log;
        connect.devices = {};
    }

    async auth() {
        const connect = this;

        if (!connect.accessToken) {
            delete axios.defaults.headers.common['Authorization'];
            connect.log('No access token found, logging in');
            await connect.login();
        }
        axios.defaults.headers.common['Authorization'] = connect.accessToken;
    }

    async login() {
        const connect = this;

        let data = {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        }

        if (connect.refreshToken) {
            connect.log('Using refresh token');
            data.grant_type = GRANT_TYPE_REFRESH;
            data.refresh_token = connect.refreshToken;
        } else {
            connect.log('Using account login');
            data.grant_type = GRANT_TYPE_PASSWORD;
            data.username = connect.username;
            data.password = connect.password;
        }
        
        return axios.post(AUTH_ENDPOINT, querystring.stringify(data))
            .then(async (response) => {
                connect.accessToken = response.data.access_token;
                connect.refreshToken = response.data.refresh_token;
    
                let decoded = jwt.decode(response.data.access_token);
                connect.userId = decoded.userId;
            })
            .catch(async (e) => {
                connect.log.warn('Error calling auth endpoint: ' + e.message);
                if (data.grant_type === GRANT_TYPE_REFRESH && e.response.status === 401) {
                    connect.log.warn('Refresh token invalid, will attempt account login');
                    delete connect.refreshToken;
                    return await connect.login();
                } else {
                    throw new Error('Authentication failed!');
                }
            });
    }

    async sync(platform) {
        const connect = this;

        await connect.auth();

        connect.log('Syncing robots');
        return axios.get(API_ENDPOINT + 'users/' + connect.userId + '/robots')
            .then(async (response) => {
                connect.log.debug('Robots Discovered: ' + response.data.length);

                response.data.forEach(robot => {
                    if (robot.isOnboarded) {
                        let device = new LitterRobotDevice(connect, platform, true, robot);
                        connect.log('Adding Robot: ' + device.name);
                        connect.devices[device.id] = device;
                    }
                });
            })
            .catch(e => {
                connect.log.error('Error calling robots endpoint: ' + e);
                throw e;
            });
    }

    addRobot(platform, accessory) {
        const connect = this;

        let robot = {}
        robot['litterRobotId'] = accessory.context.deviceId;
        // TODO: Replace hardcoded nickname
        robot['litterRobotNickname'] = "Cats";
        //platform.log('Device Type: ' + accessory.context.type);
        let accessoryInformation = accessory.getService(platform.Service.AccessoryInformation);
        let serial = accessoryInformation.getCharacteristic(platform.Characteristic.SerialNumber).value;
        robot['litterRobotSerial'] = serial;
        // Default status info until synced
        robot['unitStatus'] = "OFF";
        robot['nightLightActive'] = 0;
        robot['cycleCount'] = 0;
        robot['cycleCapacity'] = 1;
        robot['cyclesAfterDrawerFull'] = 1;

        // Cached devices will be considered unreachable until synced
        let device = new LitterRobotDevice(connect, platform, false, robot);
        connect.log('Adding Robot: ' + device.name);
        connect.devices[device.id] = device;
    }

    async syncRobot(robotId) {
        const connect = this;

        await connect.auth();

        return axios.get(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId)
            .then(async (response) => {
                if (connect.devices[robotId]) {
                    connect.devices[robotId].setDetails(response.data);
                }
            })
            .catch(async (e) => {
                if (e.response && e.response.status === 401) {
                    connect.log.warn('Auth token out of sync, refreshing');
                    delete connect.accessToken;
                    return await connect.syncRobot(robotId);
                }
                throw e;
            });
    }

    async sendCommand(robotId, robotCommand) {
        const connect = this;

        await connect.auth();

        let data = {
            litterRobotId: robotId,
            command: robotCommand
        }
        return axios.post(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId + '/dispatch-commands', data)
            .then(async (response) => {
                if (response.data._developerMessage) {
                    connect.log(response.data._developerMessage);
                }
            })
            .catch(async (e) => {
                connect.log.warn('Error calling dispatch endpoint: ' + e.message);
                if (e.response && e.response.status === 401) {
                    connect.log.warn('Auth token out of sync, refreshing');
                    delete connect.accessToken;
                    return await connect.sendCommand(robotId, robotCommand);
                }
                throw e;
            });
    }

    async sendPatch(robotId, robotData) {
        const connect = this;

        await connect.auth();
        
        return axios.patch(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId, robotData)
            .then(async (response) => {
                // No-op
                connect.log('Successfully sent patch request');
            })
            .catch(async (e) => {
                connect.log.warn('Error calling patch endpoint: ' + e.message);
                if (e.response && e.response.status === 401) {
                    connect.log.warn('Auth token out of sync, refreshing');
                    delete connect.accessToken;
                    return await connect.sendPatch(robotId, robotData);
                }
                throw e;
            });
    }

    getDevices() {
        return Object.values(this.devices);
    }
}

module.exports = LitterRobotConnect;