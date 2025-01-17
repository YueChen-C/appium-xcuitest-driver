import _ from 'lodash';
import {errors} from 'appium/driver';
import {util} from 'appium/support';
import moment from 'moment-timezone';
import {utilities} from 'appium-ios-device';
import {exec} from 'teen_process';

const MOMENT_FORMAT_ISO8601 = 'YYYY-MM-DDTHH:mm:ssZ';

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async active() {
    if (this.isWebContext()) {
      return this.cacheWebElements(await this.executeAtom('active_element', []));
    }
    return await this.proxyCommand(`/element/active`, 'GET');
  },

  /**
   * Close app (simulate device home button). It is possible to restore
   * the app after the timeout or keep it minimized based on the parameter value.
   *
   * @param {number|{timeout: number?}} [seconds]
   * - any positive number of seconds: come back after X seconds
   * - any negative number of seconds or zero: never come back
   * - undefined/null: never come back
   * - {timeout: 5000}: come back after 5 seconds
   * - {timeout: null}, {timeout: -2}: never come back
   * @this {XCUITestDriver}
   */
  async background(seconds) {
    const homescreen = '/wda/homescreen';
    const deactivateApp = '/wda/deactivateApp';

    let endpoint;
    let params = {};
    const selectEndpoint = (timeoutSeconds) => {
      if (!util.hasValue(timeoutSeconds)) {
        endpoint = homescreen;
      } else if (!isNaN(timeoutSeconds)) {
        const duration = parseFloat(timeoutSeconds);
        if (duration >= 0) {
          params = {duration};
          endpoint = deactivateApp;
        } else {
          endpoint = homescreen;
        }
      }
    };
    if (seconds && !_.isNumber(seconds) && _.has(seconds, 'timeout')) {
      const timeout = seconds.timeout;
      selectEndpoint(isNaN(Number(timeout)) ? timeout : parseFloat(String(timeout)) / 1000.0);
    } else {
      selectEndpoint(seconds);
    }
    if (!endpoint) {
      throw new errors.InvalidArgumentError(
        `Argument value is expected to be a valid number. ` +
          `${JSON.stringify(seconds)} has been provided instead`
      );
    }
    return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreen);
  },

  /**
   * Trigger a touch/fingerprint match or match failure
   *
   * @param {boolean} match - whether the match should be a success or failure
   * @this {XCUITestDriver}
   */
  async touchId(match = true) {
    await this.mobileSendBiometricMatch('touchId', match);
  },
  /**
   * Toggle whether the device is enrolled in the touch ID program
   *
   * @param {boolean} isEnabled - whether to enable or disable the touch ID program
   *
   * @this {XCUITestDriver}
   */
  async toggleEnrollTouchId(isEnabled = true) {
    await this.mobileEnrollBiometric(isEnabled);
  },
  /**
   * Get the window size
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.getWindowRect} instead.
   */
  async getWindowSize(windowHandle = 'current') {
    if (windowHandle !== 'current') {
      throw new errors.NotYetImplementedError(
        'Currently only getting current window size is supported.'
      );
    }

    if (!this.isWebContext()) {
      return await this.getWindowSizeNative();
    } else {
      return await this.getWindowSizeWeb();
    }
  },

  /**
   * Retrieves the current device's timestamp.
   *
   * @param {string} [format] - The set of format specifiers. Read
   *                          https://momentjs.com/docs/ to get the full list of supported
   *                          datetime format specifiers. The default format is
   *                          `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601
   * @returns Formatted datetime string or the raw command output if formatting fails
   * @this {XCUITestDriver}
   */
  async getDeviceTime(format = MOMENT_FORMAT_ISO8601) {
    this.log.info('Attempting to capture iOS device date and time');
    if (!this.isRealDevice()) {
      this.log.info('On simulator. Assuming device time is the same as host time');
      const cmd = 'date';
      const args = ['+%Y-%m-%dT%H:%M:%S%z'];
      const inputFormat = 'YYYY-MM-DDTHH:mm:ssZZ';
      const stdout = (await exec(cmd, args)).stdout.trim();
      this.log.debug(`Got the following output out of '${cmd} ${args.join(' ')}': ${stdout}`);
      const parsedTimestamp = moment.utc(stdout, inputFormat);
      if (!parsedTimestamp.isValid()) {
        this.log.warn(
          `Cannot parse the timestamp '${stdout}' returned by '${cmd}' command. Returning it as is`
        );
        return stdout;
      }
      // @ts-expect-error This internal prop of moment is evidently a private API
      return parsedTimestamp.utcOffset(parsedTimestamp._tzm || 0).format(format);
    }

    const {timestamp, utcOffset, timeZone} = await utilities.getDeviceTime(this.opts.udid);
    this.log.debug(`timestamp: ${timestamp}, utcOffset: ${utcOffset}, timeZone: ${timeZone}`);
    const utc = moment.unix(timestamp).utc();
    // at some point of time Apple started to return timestamps
    // in utcOffset instead of actual UTC offsets
    if (Math.abs(utcOffset) <= 12 * 60) {
      return utc.utcOffset(utcOffset).format(format);
    }
    // timeZone could either be a time zone name or
    // an UTC offset in seconds
    if (_.includes(timeZone, '/')) {
      return utc.tz(timeZone).format(format);
    }
    if (Math.abs(timeZone) <= 12 * 60 * 60) {
      return utc.utcOffset(timeZone / 60).format(format);
    }
    this.log.warn('Did not know how to apply the UTC offset. Returning the timestamp without it');
    return utc.format(format);
  },

  /**
   * Retrieves the current device time
   *
   * @param {string} format - See {@linkcode getDeviceTime.format}
   * @returns {Promise<string>} Formatted datetime string or the raw command output if formatting fails
   * @this {XCUITestDriver}
   */
  async mobileGetDeviceTime(format = MOMENT_FORMAT_ISO8601) {
    return await this.getDeviceTime(format);
  },

  /**
   * For W3C
   * @this {XCUITestDriver}
   */
  async getWindowRect() {
    const {width, height} = await this.getWindowSize();
    return {
      width,
      height,
      x: 0,
      y: 0,
    };
  },
  /**
   * @this {XCUITestDriver}
   */
  async removeApp(bundleId) {
    await this.mobileRemoveApp(bundleId);
  },
  /**
   * Start the session after it has been started.
   *
   * @this {XCUITestDriver}
   * @privateRemarks Does this make sense?
   */
  async launchApp() {
    this.log.warn('launchApp is deprecated. Please use activateApp, ' +
                  'mobile:launchApp or create a new session instead.');
    const appName = this.opts.app || this.opts.bundleId;
    try {
      await this.start();
      this.log.info(`Successfully started a session by launching '${appName}'.`);
    } catch (err) {
      this.log.warn(`Something went wrong while launching the '${appName}' app.`);
      throw err;
    }
  },
  /**
   * Stop the session without stopping the session
   * @this {XCUITestDriver}
   * @privateRemarks Does this make sense?
   */
  async closeApp() {
    this.log.warn('closeApp is deprecated. Please use terminateApp, ' +
                  'mobile:terminateApp, mobile:killApp or quit the session instead.');
    const appName = this.opts.app || this.opts.bundleId;
    try {
      await this.stop();
      this.log.info(`Successfully stopped the sessiuon for '${appName}'.`);
    } catch (err) {
      this.log.warn(`Something went wrong while closing the '${appName}' app.`);
      throw err;
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  async setUrl(url) {
    this.log.debug(`Attempting to set url '${url}'`);

    if (this.isWebContext()) {
      this.setCurrentUrl(url);
      // make sure to clear out any leftover web frames
      this.curWebFrames = [];
      await this.remote.navToUrl(url);
      return;
    }

    if (this.isRealDevice()) {
      await this.proxyCommand('/url', 'POST', {url});
    } else {
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      await this.opts.device.simctl.openUrl(url);
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  async getViewportRect() {
    const scale = await this.getDevicePixelRatio();
    // status bar height comes in unscaled, so scale it
    const statusBarHeight = Math.round((await this.getStatusBarHeight()) * scale);
    const windowSize = await this.getWindowSize();

    // ios returns coordinates/dimensions in logical pixels, not device pixels,
    // so scale up to device pixels. status bar height is already scaled.
    return {
      left: 0,
      top: statusBarHeight,
      width: windowSize.width * scale,
      height: windowSize.height * scale - statusBarHeight,
    };
  },

  /**
   * memoized in constructor
   * @this {XCUITestDriver}
   */
  async getScreenInfo() {
    return await this.proxyCommand('/wda/screen', 'GET');
  },
  /**
   * @this {XCUITestDriver}
   */
  async getStatusBarHeight() {
    const {statusBarSize} = await this.getScreenInfo();
    return statusBarSize.height;
  },

  /**
   * memoized in constructor
   * @this {XCUITestDriver}
   */
  async getDevicePixelRatio() {
    const {scale} = await this.getScreenInfo();
    return scale;
  },

  /**
   * Emulates press the given devive button name.
   *
   * @param {string} name - The name of the button to be pressed.
   * @param {number} [durationSeconds] - The duration of the button press in seconds (float).
   * @this {XCUITestDriver}
   */
  async mobilePressButton(name, durationSeconds) {
    if (!name) {
      throw new errors.InvalidArgumentError('Button name is mandatory');
    }
    if (!_.isNil(durationSeconds) && !_.isNumber(durationSeconds)) {
      throw new errors.InvalidArgumentError('durationSeconds should be a number');
    }
    return await this.proxyCommand('/wda/pressButton', 'POST', {name, duration: durationSeconds});
  },
  /**
   * @param {string} text - Text to be sent to Siri
   * @this {XCUITestDriver}
   */
  async mobileSiriCommand(text) {
    if (!text) {
      throw new errors.InvalidArgumentError('"text" argument is mandatory');
    }
    return await this.proxyCommand('/wda/siri/activate', 'POST', {text});
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async getWindowSizeWeb() {
    return await this.executeAtom('get_window_size', []);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getWindowSizeNative() {
    return await this.proxyCommand(`/window/size`, 'GET');
  },
};

export default {...helpers, ...commands};

/**
 * @typedef {Object} PressButtonOptions
 * @property {string} name - The name of the button to be pressed.
 * @property {number} [durationSeconds] - Duration in float seconds.
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
