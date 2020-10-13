'use strict';

const path = require('path');

const LitterRobotConnect = require('./litter-robot-connect');

const PLUGIN_NAME = 'homebridge-litter-robot-connect';
const PLATFORM_NAME = 'LitterRobotPlatform';

let SYNC_ERROR_COUNT = 0;
const SYNC_ERROR_MAX = 60;

class LitterRobotPlatform {

    constructor(log, config, api) {
        const platform = this;

        if (!config) {
            log.warn('Config not provided, please update your settings.');
            return;
        }

        if (!api) {
            log.warn('Homebridge API not available, please update or check your settings.');
            return;
        }

        platform.Accessory = api.platformAccessory;
        platform.Service = api.hap.Service;
        platform.Characteristic = api.hap.Characteristic;
        platform.UUIDGen = api.hap.uuid;

        platform.log = log;
        platform.config = config;
        platform.api = api;
        platform.accessories = [];

        api.on('didFinishLaunching', () => {
            log('Finished launching');

            (async () => {
                try {
                    platform.connect = new LitterRobotConnect(config, log);
                } catch(e) {
                    log.warn('Error initializing Litter-Robot Connect: ' + e);
                    return;
                }

                try {
                    await platform.connect.sync(platform);
                } catch (e) {
                    log.warn('Error syncing Litter-Robot Connect: ' + e.message);
                    platform.accessories.forEach(accessory => {
                        platform.removeAccessory(accessory);
                    });
                    return;
                }
                await platform.configure();
                setTimeout(platform.poll.bind(platform), 15000);
            })();
        });

        api.on('shutdown', () => {
            log('Shutdown');
        });
    }

    /**
     * Called when cached accessories are restored
     */
    configureAccessory(accessory) {
        const platform = this;

        platform.log('Configure Accessory: ' + accessory.displayName + ' ' + accessory.UUID);

        accessory.reachable = true;
        platform.accessories.push(accessory);
    }

    async configure() {
        const platform = this;

        let devices = platform.connect.getDevices();

        devices.forEach(async device => {
            let accessories = [];

            let robotAccessory = platform.accessories.find(accessory => {
                return accessory.context.deviceId === device.id && accessory.context.type == 'Robot';
            });
            if (!robotAccessory) {
                robotAccessory = platform.addAccessory(device, 'Robot');
                accessories.push(robotAccessory);
            } else if (platform.config.hideRobotAccessory) {
                platform.removeAccessory(robotAccessory);
            }

            let nightlightAccessory = platform.accessories.find(accessory => {
                return accessory.context.deviceId === device.id && accessory.context.type == 'Nightlight';
            });
            if (!nightlightAccessory) {
                nightlightAccessory = platform.addAccessory(device, 'Nightlight');
                accessories.push(nightlightAccessory);
            } else if (platform.config.hideNightlightAccessory) {
                platform.removeAccessory(nightlightAccessory);
            }

            let occupancyAccessory = platform.accessories.find(accessory => {
                return accessory.context.deviceId === device.id && accessory.context.type == 'Occupancy';
            });
            if (!occupancyAccessory) {
                occupancyAccessory = platform.addAccessory(device, 'Occupancy');
                accessories.push(occupancyAccessory);
            } else if (platform.config.hideOccupancyAccessory) {
                platform.removeAccessory(occupancyAccessory);
            }

            let trayAccessory = platform.accessories.find(accessory => {
                return accessory.context.deviceId === device.id && accessory.context.type == 'Tray';
            });
            if (!trayAccessory) {
                trayAccessory = platform.addAccessory(device, 'Tray');
                accessories.push(trayAccessory);
            } else if (platform.config.hideTrayAccessory) {
                platform.removeAccessory(trayAccessory);
            }

            platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
            platform.accessories.forEach(async accessory => {
                await platform.configureAccessoryServices(accessory, device);
            });
        });

        platform.accessories.forEach(accessory => {
            let existingDevice = devices.find(device => {
                let uuid = platform.UUIDGen.generate(device.id);
                return accessory.context.deviceId === device.id || accessory.UUID === uuid;
            });

            if (!existingDevice) {
                platform.removeAccessory(accessory);
            }
        });
    }

    addAccessory(device, type) {
        const platform = this;

        let uuid = platform.UUIDGen.generate(device.id + type);
        platform.log('Add Accessory: ' + device.name + ' ' + type + ' ' + uuid);
        let accessory = new platform.Accessory(device.name + ' ' + type, uuid);
        accessory.context.deviceId = device.id;
        accessory.context.type = type;

        platform.accessories.push(accessory);
        return accessory;
    }

    async configureAccessoryServices(accessory, device) {
        const platform = this;

        platform.log('Configuring ' + accessory.context.type + ' Services: ' + device.name + ' ' + device.id);

        accessory.getService(platform.Service.AccessoryInformation)
            .setCharacteristic(platform.Characteristic.Manufacturer, 'Litter-Robot')
            .setCharacteristic(platform.Characteristic.Model, device.serial.substring(0, 3))
            .setCharacteristic(platform.Characteristic.SerialNumber, device.serial)
            .setCharacteristic(platform.Characteristic.HardwareRevision, '3.0')
            .setCharacteristic(platform.Characteristic.FirmwareRevision, '1.0');

        switch (accessory.context.type) {
            case 'Robot':
                await platform.configureRobotAccessoryServices(accessory, device);
                break;
            case 'Nightlight':
                await platform.configureNightlightAccessoryServices(accessory, device);
                break;
            case 'Occupancy':
                await platform.configureOccupancyAccessoryServices(accessory, device);
                break;
            case 'Tray':
                await platform.configureTrayAccessoryServices(accessory, device);
                break;
        }
    }

    async configureRobotAccessoryServices(accessory, device) {
        const platform = this;

        let filterService = accessory.getService(platform.Service.AirPurifier);
        if (!filterService) {
            filterService = accessory.addService(platform.Service.AirPurifier);
        }
        filterService.getCharacteristic(platform.Characteristic.FilterLifeLevel).setProps({
            unit: platform.Characteristic.Units.PERCENTAGE
        });
        device.setFilterService(filterService);

        let switchService = accessory.getService(platform.Service.Switch);
        if (!switchService) {
            switchService = accessory.addService(platform.Service.Switch);
        }
        device.setSwitchService(switchService);
    }

    async configureNightlightAccessoryServices(accessory, device) {
        const platform = this;

        let nightlightService = accessory.getService(platform.Service.Lightbulb);
        if (!nightlightService) {
            nightlightService = accessory.addService(platform.Service.Lightbulb, accessory.displayName);
        }
        device.setNightlightService(nightlightService);
    }

    async configureOccupancyAccessoryServices(accessory, device) {
        const platform = this;

        let occupancyService = accessory.getServiceByUUIDAndSubType(platform.Service.OccupancySensor, 'Occupancy');
        if (!occupancyService) {
            occupancyService = accessory.addService(platform.Service.OccupancySensor, accessory.displayName, 'Occupancy');
        }
        device.setOccupancyService(occupancyService);
    }

    async configureTrayAccessoryServices(accessory, device) {
        const platform = this;

        let trayService = accessory.getServiceByUUIDAndSubType(platform.Service.OccupancySensor, 'Tray');
        if (!trayService) {
            trayService = accessory.addService(platform.Service.OccupancySensor, accessory.displayName, 'Tray');
        }
        device.setTrayService(trayService);
    }

    async poll() {
        const platform = this;

        let shouldPoll = true;
        let devices = platform.connect.getDevices();
        (async () => {
            await asyncForEach(devices, async (device) => {
                try {
                    let res = await device.sync();
                    SYNC_ERROR_COUNT = 0;
                    return res;
                } catch (e) {
                    platform.log.warn('Error syncing Litter-Robot ' + device.id + ': ' + e.message);
                    SYNC_ERROR_COUNT++;
                    if (SYNC_ERROR_COUNT === SYNC_ERROR_MAX) {
                        platform.log.error('Cancelling polling due to too many errors: ' + SYNC_ERROR_COUNT);
                        shouldPoll = false;
                    }
                }
            });
            if (shouldPoll) {
                let pollingFrequency = (platform.config.pollingFrequency) ? platform.config.pollingFrequency : 5;
                setTimeout(platform.poll.bind(platform), pollingFrequency * 1000);
            }
        })();
    }

    removeAccessory(accessory) {
        let uuid = accessory.UUID;

        this.log('Remove Accessory: ' + accessory.displayName + ' ' + accessory.UUID);

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories = this.accessories.filter(accessory => {
            return accessory.UUID !== uuid;
        });
    }
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

module.exports = {
    LitterRobotPlatform,
    PLUGIN_NAME,
    PLATFORM_NAME
}