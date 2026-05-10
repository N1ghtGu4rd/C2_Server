import { AwesomeCordovaNativePlugin } from '@awesome-cordova-plugins/core';
/**
 * @name Network Interface
 * @description
 * Network interface information plugin for Cordova/PhoneGap that supports Android, Blackberry 10, Browser, iOS, and Windows Phone 8.
 * @usage
 * ```typescript
 * import { NetworkInterface } from '@awesome-cordova-plugins/network-interface/ngx';
 *
 * constructor( private networkInterface: NetworkInterface ) {
 *
 *   this.networkInterface.getWiFiIPAddress()
 *     .then(address => console.info(`IP: ${address.ip}, Subnet: ${address.subnet}`))
 *     .catch(error => console.error(`Unable to get IP: ${error}`));
 *
 *   this.networkInterface.getCarrierIPAddress()
 *     .then(address => console.info(`IP: ${address.ip}, Subnet: ${address.subnet}`))
 *     .catch(error => console.error(`Unable to get IP: ${error}`));
 *
 *   const url = 'www.github.com';
 *   this.networkInterface.getHttpProxyInformation(url)
 *     .then(proxy => console.info(`Type: ${proxy.type}, Host: ${proxy.host}, Port: ${proxy.port}`))
 *     .catch(error => console.error(`Unable to get proxy info: ${error}`));
 * }
 * ```
 */
export declare class NetworkInterfaceOriginal extends AwesomeCordovaNativePlugin {
    /**
     * Gets the WiFi IP address
     *
     * @returns {Promise<any>} Returns a Promise that resolves with the IP address information.
     */
    getWiFiIPAddress(): Promise<any>;
    /**
     * Gets the wireless carrier IP address
     *
     * @returns {Promise<any>} Returns a Promise that resolves with the IP address information.
     */
    getCarrierIPAddress(): Promise<any>;
    /**
     * Gets the relevant proxies for the passed URL in order of application
     *
     * @param {url} message  The message to display.
     * @param url
     * @returns {Promise<any>} Returns a Promise that resolves with the proxy information.
     */
    getHttpProxyInformation(url: string): Promise<any>;
}

export declare const NetworkInterface: NetworkInterfaceOriginal;