import { Message, Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import crypto from "crypto";

// ====================== DIRECT MESSAGES ======================

export const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Message content cannot be empty." });
    }

    if (recipientId === req.user.id) {
      return res.status(400).json({ message: "Cannot send message to yourself." });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found." });
    }

    const message = new Message({
      sender: req.user.id,
      recipient: recipientId,
      content: content.trim(),
    });

    await message.save();
    await message.populate("sender", "username firstName lastName avatar");
    await message.populate("recipient", "username firstName lastName avatar");

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender: myId, recipient: userId },
        { sender: userId, recipient: myId },
      ],
      deletedFor: { $ne: myId },
    })
      .sort({ createdAt: 1 })
      .populate("sender", "username firstName lastName avatar")
      .populate("recipient", "username firstName lastName avatar");

    // Mark messages as read
    await Message.updateMany(
      { sender: userId, recipient: myId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyConversations = async (req, res) => {
  try {
    const myId = req.user.id;

    const messages = await Message.find({
      $or: [{ sender: myId }, { recipient: myId }],
      deletedFor: { $ne: myId },
    })
      .sort({ createdAt: -1 })
      .populate("sender", "username firstName lastName avatar")
      .populate("recipient", "username firstName lastName avatar");

    // Build a conversation list (last message per partner)
    const seen = new Set();
    const conversations = [];

    for (const msg of messages) {
      const partner =
        msg.sender._id.toString() === myId ? msg.recipient : msg.sender;
      const partnerId = partner._id.toString();

      if (!seen.has(partnerId)) {
        seen.add(partnerId);
        const unread = await Message.countDocuments({
          sender: partnerId,
          recipient: myId,
          read: false,
        });
        conversations.push({
          partner,
          lastMessage: msg,
          unread,
        });
      }
    }

    res.status(200).json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users (for starting a new conversation)
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ message: "Query must be at least 2 characters." });
    }

    const users = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { username: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
      ],
    }).select("username firstName lastName avatar bio").limit(10);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ====================== COMMUNITY ROOMS ======================

export const createCommunity = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Community name must be at least 2 characters." });
    }

    // Generate a unique 8-character invite key
    const inviteKey = crypto.randomBytes(4).toString("hex").toUpperCase();

    const community = new Community({
      name: name.trim(),
      description: description?.trim() || "",
      owner: req.user.id,
      members: [req.user.id],
      inviteKey,
    });

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");

    res.status(201).json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const joinCommunity = async (req, res) => {
  try {
    const { inviteKey } = req.body;

    const community = await Community.findOne({ inviteKey });
    if (!community) {
      return res.status(404).json({ message: "Invalid invite key. Community not found." });
    }

    const alreadyMember = community.members.includes(req.user.id);
    if (alreadyMember) {
      return res.status(400).json({ message: "You are already a member of this community." });
    }

    community.members.push(req.user.id);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");

    res.status(200).json({ message: "Joined community successfully!", community });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyCommunities = async (req, res) => {
  try {
    const communities = await Community.find({ members: req.user.id })
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .select("-messages"); // Don't load all messages in list view

    res.status(200).json(communities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCommunityMessages = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findById(communityId)
      .populate("messages.sender", "username firstName lastName avatar")
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar");

    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    const isMember = community.members.some(
      (m) => m._id.toString() === req.user.id
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this community." });
    }

    res.status(200).json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendCommunityMessage = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Message content cannot be empty." });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    const isMember = community.members.some(
      (m) => m.toString() === req.user.id
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this community." });
    }

    community.messages.push({
      sender: req.user.id,
      content: content.trim(),
    });

    await community.save();

    // Return the just-added message populated
    const updatedCommunity = await Community.findById(communityId)
      .populate("messages.sender", "username firstName lastName avatar");

    const newMessage = updatedCommunity.messages[updatedCommunity.messages.length - 1];

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ====================== COMMUNITY MANAGEMENT ======================

export const updateCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, description } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    if (community.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the owner can update this community." });
    }

    if (name) {
      if (name.length < 2) {
        return res.status(400).json({ message: "Community name must be at least 2 characters." });
      }
      community.name = name.trim();
    }

    if (description !== undefined) {
      community.description = description.trim();
    }

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");

    res.status(200).json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    // Owner or admin can remove members; therapists can also remove users
    const isOwner = community.owner.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isTherapist = req.user.role === "therapist";

    if (!isOwner && !isAdmin && !isTherapist) {
      return res.status(403).json({ message: "Only the owner, therapists, or admins can remove members." });
    }

    if (userId === req.user.id && !isAdmin) {
      return res.status(400).json({ message: "You cannot remove yourself." });
    }

    community.members = community.members.filter(
      (m) => m.toString() !== userId
    );

    await community.save();

    res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCommunityByKey = async (req, res) => {
  try {
    const { inviteKey } = req.params;

    const community = await Community.findOne({ inviteKey: inviteKey.toUpperCase() })
      .populate("messages.sender", "username firstName lastName avatar")
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar");

    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    const isMember = community.members.some(
      (m) => m._id.toString() === req.user.id
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this community." });
    }

    res.status(200).json(community);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markCommunityMessagesRead = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }

    // Mark all unread messages as read by this user
    let updated = false;
    for (const msg of community.messages) {
      if (!msg.readBy.includes(req.user.id)) {
        msg.readBy.push(req.user.id);
        updated = true;
      }
    }

    if (updated) {
      await community.save();
    }

    res.status(200).json({ message: "Messages marked as read." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllMyMessages = async (req, res) => {
  try {
    const myId = req.user.id;

    // Soft delete: mark messages as deleted for this user only
    const result = await Message.updateMany(
      {
        $or: [{ sender: myId }, { recipient: myId }],
        deletedFor: { $ne: myId },
      },
      { $push: { deletedFor: myId } }
    );

    res.status(200).json({
      message: `Deleted ${result.modifiedCount} messages from your view.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const unsendMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const myId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    if (message.sender.toString() !== myId) {
      return res.status(403).json({ message: "You can only unsend your own messages." });
    }

    message.unsent = true;
    message.content = "[Message unsent]";
    await message.save();

    res.status(200).json({ message: "Message unsent.", unsentMessage: message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found." });
    }
    if (req.user.role !== "admin" && community.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only admins or the owner can delete this community." });
    }
    await Community.findByIdAndDelete(communityId);
    res.status(200).json({ message: "Community deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllMyCommunityMessages = async (req, res) => {
  try {
    const myId = req.user.id;

    // Find all communities where user is a member
    const communities = await Community.find({ members: myId });

    let deletedCount = 0;
    for (const community of communities) {
      const before = community.messages.length;
      community.messages = community.messages.filter(
        (msg) => msg.sender.toString() !== myId
      );
      deletedCount += before - community.messages.length;
      if (community.messages.length !== before) {
        await community.save();
      }
    }

    res.status(200).json({
      message: `Deleted ${deletedCount} community messages.`,
      deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
