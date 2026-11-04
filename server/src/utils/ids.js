import crypto from 'node:crypto';

export const chunkId = (page, index) => 'c_' + page + '_' + index;
export const regionId = (page, index) => 'r_' + page + '_' + index;
export const segmentId = (order) => 's_' + order;
export const followupId = () => 'f_' + crypto.randomUUID().slice(0, 8);
export const followupSegmentId = (fId, order) => 'fs_' + fId + '_' + order;
export const SOURCE_ID_RE = /^[cr]_[0-9]+_[0-9]+$/;

