import type { ModelRef, ThinkingLevel } from "@porcupineai/protocol";
import type { ByteTransportFactory } from "./transport.ts";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface ConnectionStateChange {
	state: ConnectionState;
	error?: Error;
}

export type Unsubscribe = () => void;
export type ListenerErrorHandler = (error: Error) => void;

export interface PiClientOptions {
	token: string;
	transportFactory: ByteTransportFactory;
	maxFrameLength?: number;
	/** Timeout in ms before an unanswered request rejects with {@link PiRequestTimeoutError}. Defaults to 60000. */
	requestTimeoutMs?: number;
	/** Reports subscriber failures without allowing them to corrupt client state. */
	onListenerError?: ListenerErrorHandler;
}

export interface CreateSessionOptions {
	cwd?: string;
	name?: string;
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
}
