import { ClinicSettings } from '../models/ClinicSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

export const get = asyncHandler(async (req, res) => {
  let settings = await ClinicSettings.findOne();
  if (!settings) settings = await ClinicSettings.create({});
  res.json(settings);
});

export const update = asyncHandler(async (req, res) => {
  let settings = await ClinicSettings.findOne();
  if (!settings) settings = await ClinicSettings.create({});
  Object.assign(settings, req.body);
  await settings.save();
  await logAudit({ req, action: 'updated_settings', entity: 'clinic_settings', entityId: settings._id, changes: req.body });
  res.json(settings);
});