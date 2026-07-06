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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || '').trim();
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { actorName: searchRegex },
        { action: searchRegex },
        { targetType: searchRegex },
        { targetId: searchRegex },
        { details: searchRegex },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name username role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



