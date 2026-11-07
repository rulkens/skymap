/** The names the server certificate covers: localhost and `<host>.local`, plus every LAN IPv4. */
export type LanNames = { hostnames: string[]; ips: string[] };
