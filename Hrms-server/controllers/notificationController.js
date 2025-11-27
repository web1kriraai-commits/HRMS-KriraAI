import Notification from '../models/Notification.js';

export const sendNotification = async (userId, message) => {
  try {
    const notification = new Notification({
      userId,
      message,
      read: false
    });
    await notification.save();
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Clean up old notifications for this user before fetching
    // This ensures users don't see notifications that are older than 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    await Notification.deleteMany({
      userId,
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);
    
    if (!notification || notification.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.read = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    await Notification.updateMany({ userId, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);
    
    if (!notification || notification.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await Notification.findByIdAndDelete(id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cleanup function to delete notifications older than 24 hours
export const cleanupOldNotifications = async () => {
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const result = await Notification.deleteMany({
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} notification(s) older than 24 hours`);
    }
    
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
    return 0;
  }
};

