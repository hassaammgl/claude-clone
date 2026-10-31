import { readdir, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { Tool } from "./Tool";

/** Confirm prompt me content ka chhota preview, poori file nahi. */
function snippet(value: unknown, maxLines = 8): string {
    const lines = String(value ?? "").split("\n");
    const shown = lines.slice(0, maxLines);
    const more = lines.length - shown.length;
    return shown.map((line) => `  ${line}`).join("\n") + (more > 0 ? `\n  … +${more} lines` : "");
}

/** Base class: sab file tools workspace ke andar hi rehte hain */
abstract class FileTool extends Tool {
    constructor(private root: string) {
        super();
    }
    protected path(p: string = "."): string {
        const abs = resolve(this.root, p);
        if (relative(this.root, abs).startsWith("..")) throw new Error(`outside workspace: ${p}`);
        return abs;
    }
}

export class ReadFileTool extends FileTool {
    name = "read_file";
    description = "Read a file and return its content with line numbers";
    parameters = {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
    };
    async run({ path }: Record<string, any>) {
        const text = await Bun.file(this.path(path)).text();
        return text.split("\n").map((l, i) => `${i + 1}| ${l}`).join("\n");
    }
}

export class ListDirTool extends FileTool {
    name = "list_dir";
    description = "List files and folders in a directory";
    parameters = { type: "object", properties: { path: { type: "string" } } };
    async run({ path }: Record<string, any>) {
        const items = await readdir(this.path(path), { withFileTypes: true });
        return items.map((e) => e.name + (e.isDirectory() ? "/" : "")).join("\n") || "(empty)";
    }
}

export class WriteFileTool extends FileTool {
    name = "write_file";
    description = "Create a file or overwrite it with the given content";
    parameters = {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
    };
    override dangerous = true;
    override preview({ path, content }: Record<string, any>) {
        return `write ${path}\n${snippet(content)}`;
    }
    async run({ path, content }: Record<string, any>) {
        await Bun.write(this.path(path), content);
        return `wrote ${path}`;
    }
}

export class EditFileTool extends FileTool {
    name = "edit_file";
    description = "Replace old_string with new_string in a file (old_string must be unique)";
    parameters = {
        type: "object",
        properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
        required: ["path", "old_string", "new_string"],
    };
    override dangerous = true;
    override preview({ path, old_string, new_string }: Record<string, any>) {
        return `edit ${path}\n${snippet(`- ${old_string}\n+ ${new_string}`, 10)}`;
    }
    async run({ path, old_string, new_string }: Record<string, any>) {
        const file = Bun.file(this.path(path));
        const text = await file.text();
        const count = text.split(old_string).length - 1;
        if (count !== 1) throw new Error(`old_string found ${count} times, need exactly 1`);
        await Bun.write(file, text.replace(old_string, () => new_string));
        return `edited ${path}`;
    }
}

export class DeleteFileTool extends FileTool {
    name = "delete_file";
    description = "Delete a file";
    parameters = { type: "object", properties: { path: { type: "string" } }, required: ["path"] };
    override dangerous = true;
    override preview({ path }: Record<string, any>) {
        return `delete ${path}`;
    }
    async run({ path }: Record<string, any>) {
        await rm(this.path(path));
        return `deleted ${path}`;
    }
}