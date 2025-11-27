import AuditLog from '../models/AuditLog.js';

export const logAction = async (actorId, actorName, action, targetType, targetId, details, beforeData = null, afterData = null) => {
  try {
    const auditLog = new AuditLog({
      actorId,
      actorName,
      action,
      targetType,
      targetId,
      beforeData: beforeData ? JSON.stringify(beforeData) : null,
      afterData: afterData ? JSON.stringify(afterData) : null,
      details
    });
    await auditLog.save();
  } catch (error) {
    console.error('Error logging action:', error);
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await AuditLog.find()
      .populate('actorId', 'name username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



