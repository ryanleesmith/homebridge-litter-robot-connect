# homebridge-litter-robot-connect

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Litter-Robot Connect [Homebridge](https://github.com/nfarina/homebridge) Plugin

Integrates your Litter-Robot device with HomeKit. Enables monitoring of waste level, occupancy, current cycling status, as well as ability to turn on/off the nightlight, run a manual cycle, and reset the waste level gauge.

Consider using [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to manage the installation and configuration steps.

# Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plug-in using: `npm install -g homebridge-litter-robot-connect`
3. Update your configuration file. See example `config.json` snippet below.

# Configuration

Configuration sample (edit `~/.homebridge/config.json`):

```
"platforms": [
    {
        "platform":  "LitterRobotPlatform"
        "username":  "YOUR-LITTER-ROBOT-EMAIL",
        "password":  "YOUR-LITTER-ROBOT-PASSWORD",
    }
]
```

Your username and password are not stored, they are only used to generate an auth token which is used for all subsequent requests. This auth token is stored locally on disk in accordance with Homebridge rules, and expires every hour (Litter-Robot's configuration). A refresh token is used to request new auth tokens upon expiry.

Optional fields:

* `"hideRobotAccessory"`: `"true/false"` - Optionally hides the main Litter-Robot accessory controls
* `"hideNightlightAccessory"`: `"true/false"` - Optionally hides the Litter-Robot nightlight switch
* `"hideOccupancyAccessory"`: `"true/false"` - Optionally hides the Litter-Robot occupancy sensor

# How It Works
With all accessories enabled, this plugin will query the Litter-Robot API and generate the following accessories for your usage:
* **Robot/Filter Accessory**: This will appear as an Air Purifier accessory with 2 switches, a Manual/Auto toggle, and a filter level. The main power switch controls power to your device (this does not take the Litter-Robot offline, so you can still control it after "turning off"). The toggle switch will automatically "turn on" when your waste level goes above Empty, allowing you to turn it back off and send a reset request to Litter-Robot when you empty the tray. The accessory will always be in Auto mode, and switching to Manual will trigger a manual cycle, at which point it will return back to Auto. The filter life/level counts down opposite of the waste level (e.g. 25% full = 75% filter life).
* **Nightlight Accessory**: This will appear as a standard Light accessory, allowing you to toggle the nightlight in the Litter-Robot.
* **Occupancy Accessory**: This will appear as an Occupancy sensor, which will be triggered when your pet enters the Litter-Robot and triggers a timing event. Depending on your settings, this will be cleared after the timeout is reached and your Litter-Robot runs an automatic cycle after your pet exits.