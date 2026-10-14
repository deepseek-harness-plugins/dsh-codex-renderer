import React from 'react';
import {Modal} from '@deepseek-ai/dsh-client-ui-primitives';

// The host owns the mask, dialog chrome, keyboard handling and return focus.
export function PreviewModal({title,children,actions,footer,onClose,className='',onKeyDownCapture}){
  return <Modal open onClose={onClose} title={title} closeLabel="关闭预览" footer={footer} onKeyDownCapture={onKeyDownCapture} className={`dcr-dialog ${className}`}>
    {actions&&<div className="dcr-preview-actions dcr-actions">{actions}</div>}
    <div className="dcr-dialog-body" data-dcr-ui="">{children}</div>
  </Modal>;
}
