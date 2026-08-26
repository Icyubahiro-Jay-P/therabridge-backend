import { Community } from "../models/chat.model.js";
import User from "../models/user.model.js";
import { canModerate } from "./chat.utils.js";

export const joinCommunity = async (req, res) => {
  try {
    const { inviteKey } = req.body;

    const community = await Community.findOne({ inviteKey: inviteKey.toUpperCase() });
    if (!community) {
      return res
        .status(404)
        .json({ error: { message: "Invalid invite key. Community not found.", code: "NOT_FOUND" } });
    }

    const alreadyMember = community.members.some(
      (m) => m.toString() === req.user.id,
    );
    if (alreadyMember) {
      // Joining twice is an idempotent no-op - return the community so the
      // client can simply navigate into it.
      await community.populate("owner", "username firstName lastName avatar");
      await community.populate("members", "username firstName lastName avatar");
      await community.populate("moderators", "username firstName lastName avatar");
      return res
        .status(200)
        .json({ message: "You're already a member of this community.", community, alreadyMember: true });
    }

    if (community.isPrivate) {
      const alreadyPending = community.pendingMembers.some(
        (m) => m.toString() === req.user.id,
      );
      if (alreadyPending) {
        return res
          .status(202)
          .json({ message: "Your join request is already pending approval.", pending: true });
      }
      community.pendingMembers.push(req.user.id);
      await community.save();
      return res
        .status(202)
        .json({ message: "Join request sent. You will be added once a moderator approves.", pending: true });
    }

    community.members.push(req.user.id);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");

    res
      .status(200)
      .json({ message: "Joined community successfully!", community });
  } catch (error) {
    throw error;
  }
};

export const leaveCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    const isOwner = community.owner.toString() === req.user.id;
    if (isOwner) {
      return res.status(400).json({
        error: { message: "As the owner, delete the community or transfer ownership instead of leaving.", code: "BAD_REQUEST" },
      });
    }

    const wasMember = community.members.some((m) => m.toString() === req.user.id);
    if (!wasMember) {
      return res.status(400).json({ error: { message: "You are not a member of this community.", code: "BAD_REQUEST" } });
    }

    community.members = community.members.filter((m) => m.toString() !== req.user.id);
    community.moderators = (community.moderators ?? []).filter((m) => m.toString() !== req.user.id);
    await community.save();

    res.status(200).json({ message: "You left the community." });
  } catch (error) {
    throw error;
  }
};

export const getMyCommunities = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const filter = isAdmin
      ? {}
      : { $or: [{ members: req.user.id }, { pendingMembers: req.user.id }] };

    const communities = await Community.find(filter)
      .populate("owner", "username firstName lastName avatar")
      .populate("members", "username firstName lastName avatar")
      .populate("moderators", "username firstName lastName avatar")
      .populate("pendingMembers", "username firstName lastName avatar")
      .select("-messages")
      .sort({ updatedAt: -1 });

    res.status(200).json(communities);
  } catch (error) {
    throw error;
  }
};

export const getJoinRequests = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId)
      .populate("pendingMembers", "username firstName lastName avatar bio");
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators can view join requests.", code: "FORBIDDEN" },
      });
    }
    res.status(200).json(community.pendingMembers);
  } catch (error) {
    throw error;
  }
};

export const respondToJoinRequest = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const { action } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }
    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators can approve or reject join requests.", code: "FORBIDDEN" },
      });
    }

    const isPending = (community.pendingMembers ?? []).some(
      (m) => m.toString() === userId,
    );
    if (!isPending) {
      return res.status(400).json({ error: { message: "No pending request from this user.", code: "BAD_REQUEST" } });
    }

    community.pendingMembers = community.pendingMembers.filter(
      (m) => m.toString() !== userId,
    );

    let message;
    if (action === "approve") {
      if (!community.members.some((m) => m.toString() === userId)) {
        community.members.push(userId);
      }
      message = "Join request approved. User added to the community.";
    } else if (action === "reject") {
      message = "Join request rejected.";
    } else {
      return res.status(400).json({ error: { message: "Action must be 'approve' or 'reject'.", code: "BAD_REQUEST" } });
    }

    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json({ message, community });
  } catch (error) {
    throw error;
  }
};

export const inviteMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators or the owner can invite members.", code: "FORBIDDEN" },
      });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ error: { message: "User not found.", code: "NOT_FOUND" } });
    }

    if (req.user.role === "therapist") {
      const managesUser = target.therapist?.toString() === req.user.id;
      if (!managesUser) {
        return res.status(403).json({
          error: { message: "Therapists can only invite users they manage.", code: "FORBIDDEN" },
        });
      }
    }

    if (community.members.some((m) => m.toString() === userId)) {
      // The person is already in - the goal state is reached, so report
      // success instead of an error.
      return res.status(200).json({ message: "This user is already a member.", alreadyMember: true });
    }

    community.pendingMembers = (community.pendingMembers ?? []).filter(
      (m) => m.toString() !== userId,
    );
    community.members.push(userId);
    await community.save();
    await community.populate("owner", "username firstName lastName avatar");
    await community.populate("members", "username firstName lastName avatar");
    await community.populate("moderators", "username firstName lastName avatar");
    await community.populate("pendingMembers", "username firstName lastName avatar");

    res.status(200).json({ message: "Member invited successfully!", community });
  } catch (error) {
    throw error;
  }
};

export const removeMember = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { userId } = req.body;

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: { message: "Community not found.", code: "NOT_FOUND" } });
    }

    if (!canModerate(community, req.user.id, req.user.role)) {
      return res.status(403).json({
        error: { message: "Only moderators, therapists, or admins can remove members.", code: "FORBIDDEN" },
      });
    }

    if (userId === req.user.id && req.user.role !== "admin") {
      return res.status(400).json({ error: { message: "Use 'Leave community' to remove yourself.", code: "BAD_REQUEST" } });
    }

    if (community.owner.toString() === userId && req.user.role !== "admin") {
      return res.status(400).json({ error: { message: "You cannot remove the owner.", code: "BAD_REQUEST" } });
    }

    community.members = community.members.filter((m) => m.toString() !== userId);
    community.moderators = (community.moderators ?? []).filter((m) => m.toString() !== userId);
    community.pendingMembers = (community.pendingMembers ?? []).filter((m) => m.toString() !== userId);

    await community.save();

    res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    throw error;
  }
};
