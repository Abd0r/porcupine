#!/usr/bin/env node
import { APP_NAME } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import { setProductEnvironment } from "./product-environment.ts";

process.title = `${APP_NAME}-rpc`;
setProductEnvironment("CODING_AGENT", "true");
process.emitWarning = (() => {}) as typeof process.emitWarning;

configureHttpDispatcher();

main(["--mode", "rpc", ...process.argv.slice(2)]);
