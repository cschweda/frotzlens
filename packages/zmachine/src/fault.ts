import type { Fault, FaultCode } from './types.js'

/** Thrown inside the package only; run() turns it into a `fault` stop. Never escapes. */
export class MachineFault extends Error {
  constructor(
    readonly code: FaultCode,
    message: string,
  ) {
    super(message)
  }

  toFault(pc: number): Fault {
    return { code: this.code, message: this.message, pc }
  }
}

export const fail = (code: FaultCode, message: string): never => {
  throw new MachineFault(code, message)
}

export const hex = (n: number, width = 4) => '0x' + n.toString(16).padStart(width, '0')
