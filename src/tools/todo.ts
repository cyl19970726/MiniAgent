import { Type } from "../..";
import { BaseTool } from "../baseTool";

let GlobalTodoList: string[] = [];

export class TodoTool extends BaseTool<{ op: "update" | "get", todo: string[] }, { success: boolean, result: string | string[] }> {
    constructor() {
        super(
            "todo", 
            "Todo", 
            `The Todo tool used to manage the todo list.

            Format:
            each todo item should be a string with the following markfown todo format:
            -[x] for completed todo item
            -[ ] for uncompleted todo item
            
            Usage: 
            1. create the todo list for complex task.
            2. update the todo list when you have completed a todo item or you think the todo list is outdated
            3. after you have completed all the todo items, you can update the todo list to empty or create a new todo list for a new task
            `,
            {
                type: Type.OBJECT,
                properties: {
                    op: { type: Type.STRING, enum: ["update", "get"] },
                    todo: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
            },
        );
    }

    protected async executeCore(params: { op: "update" | "get", todo: string[] }): Promise<{ success: boolean, result: string | string[] }> {
        switch (params.op) {
            case "update":
                GlobalTodoList = params.todo;
                return {
                    success: true,
                    result: `Todo updated: ${GlobalTodoList.join(", ")}`
                };
            case "get":
                return {
                    success: true,
                    result: GlobalTodoList
                };
        }
    }
}