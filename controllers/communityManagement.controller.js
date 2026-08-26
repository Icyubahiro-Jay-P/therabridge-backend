import { Community } from "../models/chat.model.js";
import crypto from "crypto";

export const createCommunity = async (req, res) => {
  try {
    const { name, description, category, isPrivate, rules } = req.body;

    if (req.user.role !== "therapist" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: { message: "Only therapists and admins can create communities.", code: "FORBIDDEN" } });
    }

    if (!name || name.length < 2) {
      return res
        .status(400)
        .json({ error: { message: "Community name must be at least 2 characters.", code: "BAD_REQUEST" } });
    }

    let community;
    for (let attempts = 0; attempts < 5; attempts++) {
      const inviteKey = crypto.randomBytes(4).toString("hex").toUpperCase();
      community = new Community({
        name: name.trim(),
        description: description?.trim() || "",
        category: category || "general",
        isPrivate: Boolean(isPrivate),
        rules: rules?.trim() || "",
        owner: req.user.id,
        members: [req.user.id],
        inviteKey,
      });
      try {
        await community.save();
        break;
      } catch (err) {
        if (err.code !== 11000 || attempts === 4) throw err;
      }
    }

    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(201).json(community);
  } catch (error) {
    throw error;
  }
};

export const updateCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { name, description, category, isPrivate, rules } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    if (community.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: { message: "Only the owner can update this community.", code: "FORBIDDEN" } });
    }

    if (name) {
      community.name = name.trim();
    }
    if (description !== undefined) {
      community.description = description.trim();
    }
    if (category !== undefined) {
      const categories = [
        "general", "anxiety", "depression", "stress",
        "mindfulness", "support", "therapy", "wellness",
      ];
      if (!categories.includes(category)) {
        return res.status(400).json({ error: { message: "Invalid category.", code: "BAD_REQUEST" } });
      }
      community.category = category;
    }
    if (isPrivate !== undefined) {
      community.isPrivate = Boolean(isPrivate);
    }
    if (rules !== undefined) {
      community.rules = rules.trim();
    }

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (
      req.user.role !== "admin" &&
      community.owner.toString() !== req.user.id
    ) {
      return res.status(403).json({
        error: { message: "Only admins or the owner can delete this community.", code: "FORBIDDEN" },
      });
    }
    await Community.findByIdAndDelete(communityId);
    res.status(200).json({ message: "Community deleted successfully." });
  } catch (error) {
    throw error;
  }
};

export const toggleDisableCommunity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Only admins can disable communities.", code: "FORBIDDEN" } });
    }
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    community.isDisabled = !community.isDisabled;
    await community.save();
    res.status(200).json({ isDisabled: community.isDisabled, message: community.isDisabled ? "Community disabled." : "Community enabled." });
  } catch (error) {
    throw error;
  }
};

export const getCommunityByKey = async (req, res) => {
  try {
    const { inviteKey } = req.params;

    const community = await Community.findOne({
      inviteKey: inviteKey.toUpperCase(),
    })
      .populate("messages.sender", "username firstName lastName avatar")
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .populate("moderators", "username firstName lastName avatar")
      .populate("pendingMembers", "username firstName lastName avatar");

    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const isMember = community.members.some(
      (m) => m._id.toString() === req.user.id,
    );
    if (!isMember) {
      const isPending = community.pendingMembers.some(
        (m) => m._id.toString() === req.user.id,
      );
      if (isPending) {
        return res
          .status(403)
          .json({ error: { message: "Your join request is pending approval.", code: "PENDING_APPROVAL" } });
      }
      return res
        .status(403)
        .json({ error: { message: "You are not a member of this community.", code: "FORBIDDEN" } });
    }

    res.status(200).json(community);
  } catch (error) {
    throw error;
  }
};

export const addModerator = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (community.owner.toString() !== req.user.id) {
      return res.status(403).json({
        error: { message: "Only the owner can appoint moderators.", code: "FORBIDDEN" },
      });
    }
    if (!community.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ error: { message: "User must be a member first.", code: "BAD_REQUEST" } });
    }
    if ((community.moderators ?? []).some((m) => m.toString() === userId)) {
      return res.status(200).json({ message: "This user is already a moderator.", alreadyModerator: true });
    }

    community.moderators.push(userId);
    await community.save();
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(200).json({ message: "Moderator added.", moderators: community.moderators });
  } catch (error) {
    throw error;
  }
};

export const removeModerator = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (community.owner.toString() !== req.user.id) {
      return res.status(403).json({
        error: { message: "Only the owner can remove moderators.", code: "FORBIDDEN" },
      });
    }

    community.moderators = (community.moderators ?? []).filter(
      (m) => m.toString() !== userId,
    );
    await community.save();
    await community.populate("moderators", "username firstName lastName avatar");

    res.status(200).json({ message: "Moderator removed.", moderators: community.moderators });
  } catch (error) {
    throw error;
  }
};
