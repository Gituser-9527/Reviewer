import { extractDocument } from './extractor.js';
import type { ExtensionMessage } from './types.js';

chrome.runtime.onMessage.addListener((message:unknown,_sender,respond)=>{const m=message as Partial<ExtensionMessage>;if(m.type!=='EXTRACT_CURRENT_JOB'){respond({type:'JOB_EXTRACTION_FAILED',code:'INVALID_PAGE'});return;} const capture=extractDocument(document,location.href);respond(capture?{type:'JOB_EXTRACTION_SUCCEEDED',capture}:{type:'JOB_EXTRACTION_FAILED',code:'NO_JOB_FOUND'});return true;});
