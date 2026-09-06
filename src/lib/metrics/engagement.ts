export function calculatePostER(post: {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
}): number | null {
  if (!post.subscribersAtPublish || post.subscribersAtPublish <= 0) {
    return null;
  }

  const views = post.views || 0;
  const reactions = post.reactions || 0;
  const comments = post.comments || 0;
  const forwards = post.forwards || 0;

  const totalEngagement = views + reactions + comments + forwards;

  return (totalEngagement / post.subscribersAtPublish) * 100;
}

export function aggregateChannelER(
  posts: {
    views?: number | null;
    reactions?: number | null;
    comments?: number | null;
    forwards?: number | null;
    subscribersAtPublish?: number | null;
  }[]
): number | null {
  let sumER = 0;
  let count = 0;

  for (const post of posts) {
    const er = calculatePostER(post);
    if (er !== null) {
      sumER += er;
      count++;
    }
  }

  return count > 0 ? sumER / count : null;
}
