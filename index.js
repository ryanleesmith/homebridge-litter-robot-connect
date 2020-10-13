'use strict';

const platform = require('./lib/litter-robot-platform');

module.exports = function (homebridge) {
    homebridge.registerPlatform(platform.PLUGIN_NAME, platform.PLATFORM_NAME, platform.LitterRobotPlatform, true);
}