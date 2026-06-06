import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { dialGet, dialSet, dialRemoveApp } from './dial.js';
import {
  keyboardListDevices,
  keyboardGetKeycode,
  keyboardSetKeycode,
  macroGetAll,
  macroSetText,
} from './keyboard.js';

const server = new Server(
  { name: 'dial', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'dial_get',
      description: 'Surface Dial의 현재 앱별 키 매핑 설정을 반환합니다.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'dial_set',
      description: 'Surface Dial의 특정 앱/이벤트에 대한 동작을 설정합니다. 설정 후 데몬이 자동 재시작됩니다.',
      inputSchema: {
        type: 'object',
        required: ['app', 'event', 'action'],
        properties: {
          app: {
            type: 'string',
            description: '앱 번들 ID (예: com.google.Chrome) 또는 "default"',
          },
          event: {
            type: 'string',
            enum: ['rotateClockwise', 'rotateCounterClockwise', 'click', 'longPress'],
            description: '다이얼 이벤트',
          },
          action: {
            type: 'object',
            description: '동작 정의. type="key": { keyCode, modifiers[] } | type="activate": { bundleId }',
          },
        },
      },
    },
    {
      name: 'dial_remove_app',
      description: 'Surface Dial 앱별 설정에서 특정 앱을 제거합니다.',
      inputSchema: {
        type: 'object',
        required: ['bundleId'],
        properties: {
          bundleId: { type: 'string', description: '제거할 앱 번들 ID' },
        },
      },
    },
    {
      name: 'keyboard_list_devices',
      description: 'Creator Micro 연결 상태를 확인합니다. HID 인터페이스 목록을 반환합니다.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'keyboard_get_key',
      description: 'Creator Micro 특정 레이어/키의 현재 keycode를 읽습니다.',
      inputSchema: {
        type: 'object',
        required: ['layer', 'keyNum'],
        properties: {
          layer: { type: 'number', description: '레이어 번호 (0-3)' },
          keyNum: { type: 'number', description: '키 번호 (1-12)' },
        },
      },
    },
    {
      name: 'keyboard_set_key',
      description: 'Creator Micro 특정 레이어/키에 keycode를 설정합니다.',
      inputSchema: {
        type: 'object',
        required: ['layer', 'keyNum', 'keycode'],
        properties: {
          layer: { type: 'number', description: '레이어 번호 (0-3)' },
          keyNum: { type: 'number', description: '키 번호 (1-12)' },
          keycode: { type: 'string', description: 'QMK keycode (예: "0x0028" for Enter, "0x0004" for A)' },
        },
      },
    },
    {
      name: 'macro_get_all',
      description: 'Creator Micro의 모든 매크로 슬롯 내용을 읽습니다.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_selection',
      description: '웹 UI에서 현재 사용자가 클릭해서 선택한 요소를 반환합니다. 키 주입 전 반드시 호출하여 대상을 확인하세요.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'macro_set',
      description: 'Creator Micro 매크로 슬롯에 텍스트 명령어를 설정합니다. (예: "git status\\n")',
      inputSchema: {
        type: 'object',
        required: ['slot', 'text'],
        properties: {
          slot: { type: 'number', description: '매크로 슬롯 번호 (0부터 시작, 키 번호 = slot + 1)' },
          text: { type: 'string', description: '입력할 텍스트. \\n으로 Enter 포함.' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let result;

    switch (name) {
      case 'dial_get':
        result = dialGet();
        break;
      case 'dial_set':
        result = dialSet(args.app, args.event, args.action);
        break;
      case 'dial_remove_app':
        result = dialRemoveApp(args.bundleId);
        break;
      case 'keyboard_list_devices':
        result = keyboardListDevices();
        break;
      case 'keyboard_get_key':
        result = keyboardGetKeycode(args.layer, args.keyNum);
        break;
      case 'keyboard_set_key':
        result = keyboardSetKeycode(args.layer, args.keyNum, args.keycode);
        break;
      case 'macro_get_all':
        result = macroGetAll();
        break;
      case 'get_selection': {
        const r = await fetch('http://localhost:3333/api/selection');
        result = await r.json();
        break;
      }
      case 'macro_set':
        result = macroSetText(args.slot, args.text);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[dial MCP] Server started');
