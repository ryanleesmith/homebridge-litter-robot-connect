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

    constructor({username, password}, log, storage) {
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
        connect.storage = storage;
        connect.devices = [];
    }

    async auth() {
        const connect = this;

        let accessToken = await connect.storage.getItem('access_token');
        if (!accessToken) {
            delete axios.defaults.headers.common['Authorization'];
            connect.log('No access token found, logging in');
            await connect.login();
            accessToken = await connect.storage.getItem('access_token');
        }
        axios.defaults.headers.common['Authorization'] = accessToken;
        connect.userId = await connect.storage.getItem('user_id');
    }

    async login() {
        const connect = this;

        let data = {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        }
    
        let refresh_token = await connect.storage.getItem('refresh_token');
        if (refresh_token) {
            connect.log('Using refresh token');
            data.grant_type = GRANT_TYPE_REFRESH;
            data.refresh_token = refresh_token;
        } else {
            connect.log('Using account login');
            data.grant_type = GRANT_TYPE_PASSWORD;
            data.username = connect.username;
            data.password = connect.password;
        }
        
        return axios.post(AUTH_ENDPOINT, querystring.stringify(data))
            .then(async (response) => {
                await connect.storage.setItem('access_token', response.data.access_token, {ttl: response.data.expires_in * 1000});
                await connect.storage.setItem('refresh_token', response.data.refresh_token);
    
                let decoded = jwt.decode(response.data.access_token);
                await connect.storage.setItem('user_id', decoded.userId);
            })
            .catch(e => {
                connect.log('Error calling auth endpoint: ' + e);
            });
    }

    async sync(platform) {
        const connect = this;

        await connect.auth();

        connect.log('Syncing robots');
        return axios.get(API_ENDPOINT + 'users/' + connect.userId + '/robots')
            .then(async (response) => {
                connect.log('Robots: ' + response.data.length);

                response.data.forEach(robot => {
                    let device = new LitterRobotDevice(connect, platform, robot);
                    connect.devices.push(device);
                });
            })
            .catch(e => {
                connect.log('Error calling robots endpoint: ' + e);
            });
    }

    async syncRobot(robotId) {
        const connect = this;

        await connect.auth();

        return axios.get(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId)
            .then(async (response) => {
                let device = connect.devices.find(device => {
                    return device.id == robotId;
                });
                if (device) {
                    device.setDetails(response.data);
                }
            })
            .catch(e => {
                connect.log('Error calling robots endpoint: ' + e);
            });
    }

    async sendCommand(robotId, robotCommand) {
        const connect = this;

        await connect.auth();

        let data = {
            litterRobotId: robotId,
            command: robotCommand
        }
        connect.log('Sending command');
        return axios.post(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId + '/dispatch-commands', data)
            .then(async (response) => {
                if (response.data._developerMessage) {
                    connect.log(response.data._developerMessage);
                }
            })
            .catch(e => {
                connect.log('Error calling dispatch endpoint: ' + e);
                connect.log(e);
            });
    }

    async sendPatch(robotId, robotData) {
        const connect = this;

        await connect.auth();
        
        connect.log('Sending patch');
        return axios.patch(API_ENDPOINT + 'users/' + connect.userId + '/robots/' + robotId, robotData)
            .then(async (response) => {
                // No-op
            })
            .catch(e => {
                connect.log('Error calling patch endpoint: ' + e);
                connect.log(e);
            });
    }

    getDevices() {
        return this.devices;
    }
}

module.exports = LitterRobotConnect;