'use strict';

const POWER_ON = "<P1";
const POWER_OFF = "<P0";

const NIGHT_LIGHT_ON = "<N1";
const NIGHT_LIGHT_OFF = "<N0";

const CYCLE = "<C";

class LitterRobotDevice {

    constructor(connect, platform, {litterRobotId, litterRobotNickname, litterRobotSerial, unitStatus, nightLightActive, cycleCount, cycleCapacity, cyclesAfterDrawerFull}) {
        this.connect = connect;
        this.platform = platform;
        this.id = litterRobotId;
        this.name = litterRobotNickname;
        this.serial = litterRobotSerial;
        this.setDetails({unitStatus, nightLightActive, cycleCount, cycleCapacity, cyclesAfterDrawerFull});
    }

    setDetails({unitStatus, nightLightActive, cycleCount, cycleCapacity, cyclesAfterDrawerFull}) {
        this.status = unitStatus;
        this.nightlightStatus = nightLightActive;
        this.cycleCount = cycleCount;
        this.cycleCapacity = cycleCapacity;
        this.cyclesAfterDrawerFull = cyclesAfterDrawerFull;
    }

    setFilterService(service) {
        const platform = this.platform;
        const device = this;

        this.filterService = service;
        this.filterService.getCharacteristic(platform.Characteristic.Active)
            .on('get', async (callback) => {
                platform.log('Power state requested');
                let value = device.getPower();
                callback(null, value);
            })
            .on('set', async (value, callback) => {
                platform.log('Power state changed');
                let err = null;
                try {
                    await device.setPower(value);
                    // Set current state to idle if turning on, otherwise set to inactive to ensure proper shutdown
                    let state = (value) ? platform.Characteristic.CurrentAirPurifierState.IDLE : platform.Characteristic.CurrentAirPurifierState.INACTIVE;
                    device.filterService.updateCharacteristic(platform.Characteristic.CurrentAirPurifierState, state);
                } catch (e) {
                    err = e;
                }
                callback(err);
            });

        this.filterService.getCharacteristic(platform.Characteristic.CurrentAirPurifierState)
            .on('get', async (callback) => {
                platform.log('Current mode state requested');
                let state = platform.Characteristic.CurrentAirPurifierState.INACTIVE;
                if (device.getPower()) {
                    state = platform.Characteristic.CurrentAirPurifierState.IDLE;
                }
                if (device.getMotion()) {
                    state = platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
                }
                callback(null, state);
            })
        
        this.filterService.getCharacteristic(platform.Characteristic.TargetAirPurifierState)
            .on('get', async (callback) => {
                platform.log('Target mode state requested');
                // Should always default back to AUTO
                callback(null, platform.Characteristic.TargetAirPurifierState.AUTO);
            })
            .on('set', async (value, callback) => {
                platform.log('Target mode state changed');
                let err = null;
                if (!value) {
                    try {
                        // Run cycle if setting to MANUAL mode
                        await device.runCycle();
                    } catch (e) {
                        err = e;
                    }
                }
                callback(err);
            });

        this.filterService.getCharacteristic(platform.Characteristic.FilterLifeLevel)
            .on('get', async (callback) => {
                platform.log('Filter life state requested');
                callback(null, device.getFilterLife());
            });

        this.filterService.getCharacteristic(platform.Characteristic.FilterChangeIndication)
            .on('get', async (callback) => {
                platform.log('Filter change state requested');
                callback(null, device.getFilterChange());
            });
    }

    setSwitchService(service) {
        const platform = this.platform;
        const device = this;

        this.switchService = service;
        this.switchService.getCharacteristic(platform.Characteristic.On)
            .on('get', async (callback) => {
                platform.log('Reset switch state requested');
                callback(null, device.getFilterLife() < 100.0);
            })
            .on('set', async (value, callback) => {
                platform.log('Reset switch state changed');
                let err = null;
                let power = device.getPower();
                if (!power || device.getFilterLife() === 100.0) {
                    // Gauge cannot be reset when powered off or at 0% capacity
                    err = new Error('Waste level gauge cannot be reset at this time!')
                } else {
                    try {
                        await device.resetGauge(value);
                    } catch (e) {
                        err = e;
                    }
                }
                callback(err);
            });
    }

    setNightlightService(service) {
        const platform = this.platform;
        const device = this;

        this.nightlightService = service;
        this.nightlightService.getCharacteristic(platform.Characteristic.On)
            .on('get', async (callback) => {
                platform.log('Nightlight state requested');
                let value = device.getNightlight();
                callback(null, value);
            })
            .on('set', async (value, callback) => {
                platform.log('Nightlight state changed');
                let err = null;
                let power = device.getPower();
                if (!power) {
                    // Nightlight cannot be controlled if no power
                    err = new Error('Nightlight cannot be controlled while device is powered off!')
                } else {
                    try {
                        await device.setNightlight(value);
                    } catch (e) {
                        err = e;
                    }
                }
                callback(err);
            });
    }

    setOccupancyService(service) {
        const platform = this.platform;
        const device = this;

        this.occupancyService = service;
        this.occupancyService.getCharacteristic(platform.Characteristic.OccupancyDetected)
            .on('get', async (callback) => {
                platform.log('Occupancy state requested');
                let value = device.getOccupancy();
                callback(null, value);
            });
        this.occupancyService.getCharacteristic(platform.Characteristic.StatusActive)
            .on('get', async (callback) => {
                platform.log('Occupancy status state requested');
                let value = device.getOccupancyFault();
                callback(null, !value);
            });
        this.occupancyService.getCharacteristic(platform.Characteristic.StatusFault)
            .on('get', async (callback) => {
                platform.log('Occupancy status state requested');
                let value = device.getOccupancyFault();
                callback(null, value);
            });
    }

    async sync() {
        return await this.connect.syncRobot(this.id);
    }

    getPower() {
        return this.status !== "OFF" && this.status !== "offline";
    }

    async setPower(value) {
        this.status = value ? "RDY" : "OFF";
        let command = value ? POWER_ON : POWER_OFF;
        return await this.sendCommand(command);
    }

    getNightlight() {
        return this.nightlightStatus;
    }

    async setNightlight(value) {
        this.nightlightStatus = value;
        let command = value ? NIGHT_LIGHT_ON : NIGHT_LIGHT_OFF;
        return await this.sendCommand(command);
    }

    getOccupancy() {
        return this.status === "CST";
    }

    getOccupancyFault() {
        return this.status === "CSF" || this.status === "CSI";
    }

    getMotion() {
        return this.status === "CCP";
    }

    getFilterLife() {
        return Math.floor(100.0 * (1.0 - (parseFloat(this.cycleCount) / parseFloat(this.cycleCapacity))));
    }

    getFilterChange() {
        return this.status.startsWith("DF");
    }

    async runCycle() {
        return await this.sendCommand(CYCLE);
    }

    async resetGauge() {
        let data = {
            cycleCount: 0,
            cycleCapacity: this.cycleCapacity,
            cyclesAfterDrawerFull: this.cyclesAfterDrawerFull
        }
        return await this.connect.sendPatch(this.id, data);
    }

    async sendCommand(command) {
        return await this.connect.sendCommand(this.id, command);
    }
}

module.exports = LitterRobotDevice;