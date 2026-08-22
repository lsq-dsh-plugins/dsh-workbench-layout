import { describe, expect, it } from 'vitest'
import { errorResponse, WorkbenchHttpError } from '../src/http.ts'
import { WorkbenchInputError } from '../src/path-policy.ts'

describe('workbench HTTP policy', () => {
  it('keeps expected errors stable and removes internal failure details', () => {
    expect(errorResponse(new WorkbenchHttpError(403, 'NO', '拒绝'))).toEqual({
      status: 403,
      body: { error: { code: 'NO', message: '拒绝' } },
    })
    expect(errorResponse(new WorkbenchInputError('INVALID_PATH', '无效'))).toEqual({
      status: 400,
      body: { error: { code: 'INVALID_PATH', message: '无效' } },
    })
    expect(errorResponse(new Error('contains a private path'))).toEqual({
      status: 400,
      body: { error: { code: 'WORKBENCH_OPERATION_FAILED', message: '工作台操作失败，请查看 DSH 日志。' } },
    })
  })
})
