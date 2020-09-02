import yargs from "yargs";
import fs, {WriteStream} from "fs";
import {OutputFormat} from "./OutputFormat";
import {IonTypes, makeTextWriter} from "./Ion";
import {Writable} from "stream";

/** common CLI arguments structure */
export class IonCliCommonArgs {
    inputFiles: Array<string>;
    outputFile: Writable;
    outputFormatName: OutputFormat;
    errorReportFile: Writable;

    constructor(argv: yargs.Arguments) {
        this.outputFile = argv["output"] ? fs.createWriteStream(argv["output"] as string, {flags: 'w'}) : process.stdout;
        // create error output stream (DEFAULT: stderr)
        this.errorReportFile = argv["error-report"] ? fs.createWriteStream(argv["error-report"] as string, {flags: 'w'}) : process.stderr;
        this.outputFormatName = argv["output-format"] as OutputFormat;
        this.inputFiles = argv["input-file"] as Array<string>;
    }

    getOutputFile(): Writable {
        return this.outputFile;
    }

    getErrorReportFile(): Writable {
        return this.errorReportFile;
    }

    getInputFiles(): Array<string> {
        return this.inputFiles;
    }

    getOutputFormatName(): OutputFormat {
        return this.outputFormatName;
    }
}

/** Error Types symbol[READ | WRITE | STATE] */
export enum ErrorType {
    READ = "READ",
    WRITE = "WRITE",
    STATE = "STATE"
}

/** Error structure for error report */
export class IonCliError {
    errorType: ErrorType;
    eventIndex: number;
    location: string;
    message: string;
    errorReportFile: any;

    constructor(errorType: ErrorType, location: string, message: string, errorReportFile: any, eventIndex: number = 0) {
        this.errorType = errorType;
        this.location = location;
        this.message = message;
        this.errorReportFile = errorReportFile;
        this.eventIndex = eventIndex;
    }

    writeErrorReport() {
        let writer = makeTextWriter();
        writer.stepIn(IonTypes.STRUCT);
        writer.writeFieldName('error_type');
        writer.writeSymbol(this.errorType);
        writer.writeFieldName('message');
        writer.writeString(this.message);
        writer.writeFieldName('location');
        writer.writeString(this.location);
        writer.writeFieldName('event_index');
        writer.writeInt(this.eventIndex);
        writer.stepOut();
        this.errorReportFile.write(writer.getBytes());
        this.errorReportFile.write("\n");
    }
}

/**
 * This will cause `yargs` to look in other .ts files in the same directory for command modules.
 *
 * For more information, see:
 * Command modules: https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
 * commandDir: https://github.com/yargs/yargs/blob/master/docs/advanced.md#commanddirdirectory-opts
 */
const argv = yargs
    .commandDir(__dirname,{
        extensions: ['ts'],
    })
    .options({
        'output': {
            alias: 'o',
            description: 'Output location. [default: stdout]',
        },
        'output-format': {
            alias: 'f',
            choices: ['pretty', 'text', 'binary', 'events', 'none'] as const,
            default: 'pretty',
            description: "Output format, from the set (text | pretty | binary |\n"
                + "events | none). 'events' is only available with the\n"
                + "'process' command, and outputs a serialized EventStream\n"
                + "representing the input Ion stream(s)."
        },
        'error-report': {
            alias: 'e',
            description: 'ErrorReport location. [default: stderr]',
        }
    }).argv;



